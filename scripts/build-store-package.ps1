[CmdletBinding()]
param(
    [string]$ProjectRoot = '',
    [string]$OutputPath = '',
    [ValidateSet('None', 'AfterReplace', 'OutputChangedBeforeRecovery')]
    [string]$FailureInjection = 'None'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-Sha256Hex {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $stream = $null
    $hasher = $null
    try {
        $stream = [System.IO.File]::OpenRead($Path)
        $hasher = [System.Security.Cryptography.SHA256]::Create()
        return [System.BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '')
    } finally {
        if ($hasher) {
            $hasher.Dispose()
        }
        if ($stream) {
            $stream.Dispose()
        }
    }
}

function Get-ProjectEntryPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string]$EntryName
    )

    $path = $Root
    foreach ($segment in ($EntryName -split '/')) {
        $path = Join-Path $path $segment
    }

    return $path
}

$safeSeed = "globalThis.RepoSignalSeed = Object.freeze([]);`n"
$allowList = @(
    'manifest.json',
    'icons/repo-signal-16.png',
    'icons/repo-signal-32.png',
    'icons/repo-signal-48.png',
    'icons/repo-signal-128.png',
    'src/background.js',
    'src/shared.js',
    'src/styles.js',
    'src/content.js',
    'src/options/options.html',
    'src/options/options.css',
    'src/options/options.js'
)
$packageEntries = @($allowList + 'src/repositories.generated.js')

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = Join-Path $PSScriptRoot '..'
}

$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    throw "Project root was not found: $ProjectRoot"
}

$manifestPath = Get-ProjectEntryPath -Root $ProjectRoot -EntryName 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Manifest was not found: $manifestPath"
}

$manifest = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
$version = [string]$manifest.version
if ([string]::IsNullOrWhiteSpace($version)) {
    throw 'Manifest version is required.'
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path (Get-ProjectEntryPath -Root $ProjectRoot -EntryName 'dist') (
        "repo-signal-{0}.zip" -f $version
    )
} elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $ProjectRoot $OutputPath
}

$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $OutputPath
$stagingDirectory = $null
$temporaryOutputPath = $null
$replacementBackupPath = $null
$replacementCompleted = $false

try {
    foreach ($entryName in $allowList) {
        $sourcePath = Get-ProjectEntryPath -Root $ProjectRoot -EntryName $entryName
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "Required package source was not found: $entryName"
        }
    }

    $stagingDirectory = Join-Path ([System.IO.Path]::GetTempPath()) (
        'repo-signal-store-' + [Guid]::NewGuid().ToString('N')
    )
    [System.IO.Directory]::CreateDirectory($stagingDirectory) | Out-Null

    foreach ($entryName in $allowList) {
        $sourcePath = Get-ProjectEntryPath -Root $ProjectRoot -EntryName $entryName
        $stagingPath = Get-ProjectEntryPath -Root $stagingDirectory -EntryName $entryName
        [System.IO.Directory]::CreateDirectory((Split-Path -Parent $stagingPath)) | Out-Null
        Copy-Item -LiteralPath $sourcePath -Destination $stagingPath -Force
    }

    $seedPath = Get-ProjectEntryPath -Root $stagingDirectory -EntryName 'src/repositories.generated.js'
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $seedPath)) | Out-Null
    [System.IO.File]::WriteAllText(
        $seedPath,
        $safeSeed,
        [System.Text.UTF8Encoding]::new($false)
    )

    [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
    $temporaryOutputPath = Join-Path $outputDirectory (
        '.repo-signal-store-' + [Guid]::NewGuid().ToString('N') + '.zip'
    )

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = $null
    try {
        $archive = [System.IO.Compression.ZipFile]::Open(
            $temporaryOutputPath,
            [System.IO.Compression.ZipArchiveMode]::Create
        )

        foreach ($entryName in $packageEntries) {
            $stagingPath = Get-ProjectEntryPath -Root $stagingDirectory -EntryName $entryName
            $zipEntry = $archive.CreateEntry(
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            )
            $inputStream = $null
            $entryStream = $null
            try {
                $inputStream = [System.IO.File]::OpenRead($stagingPath)
                $entryStream = $zipEntry.Open()
                $inputStream.CopyTo($entryStream)
            } finally {
                if ($entryStream) {
                    $entryStream.Dispose()
                }
                if ($inputStream) {
                    $inputStream.Dispose()
                }
            }
        }
    } finally {
        if ($archive) {
            $archive.Dispose()
        }
    }

    $hash = Get-Sha256Hex -Path $temporaryOutputPath
    if (Test-Path -LiteralPath $OutputPath -PathType Leaf) {
        $replacementBackupPath = Join-Path $outputDirectory (
            '.repo-signal-store-' + [Guid]::NewGuid().ToString('N') + '.bak'
        )
        [System.IO.File]::Replace(
            $temporaryOutputPath,
            $OutputPath,
            $replacementBackupPath
        )
        $temporaryOutputPath = $null
        if ($FailureInjection -eq 'OutputChangedBeforeRecovery') {
            [System.IO.File]::WriteAllText(
                $OutputPath,
                'simulated-concurrent-output',
                [System.Text.UTF8Encoding]::new($false)
            )
            throw "Injected package replacement failure: $FailureInjection"
        }
        if ($FailureInjection -eq 'AfterReplace') {
            throw "Injected package replacement failure: $FailureInjection"
        }
    } else {
        [System.IO.File]::Move($temporaryOutputPath, $OutputPath)
        $temporaryOutputPath = $null
    }

    $replacementCompleted = $true
    if ($replacementBackupPath -and (Test-Path -LiteralPath $replacementBackupPath -PathType Leaf)) {
        Remove-Item -LiteralPath $replacementBackupPath -Force
        $replacementBackupPath = $null
    }
    Write-Output ("Store package: {0}" -f $OutputPath)
    Write-Output ("Version: {0}" -f $version)
    Write-Output ("File count: {0}" -f $packageEntries.Count)
    Write-Output ("SHA-256: {0}" -f $hash)
} catch {
    [Console]::Error.WriteLine("Store package build failed: {0}", $_.Exception.Message)
    exit 1
} finally {
    if (
        -not $replacementCompleted -and
        $replacementBackupPath -and
        (Test-Path -LiteralPath $replacementBackupPath -PathType Leaf)
    ) {
        try {
            if (Test-Path -LiteralPath $OutputPath -PathType Leaf) {
                $currentOutputHash = Get-Sha256Hex -Path $OutputPath
                if ($currentOutputHash -cne $hash) {
                    throw 'Output changed after package replacement.'
                }
                Remove-Item -LiteralPath $OutputPath -Force
            }
            [System.IO.File]::Move($replacementBackupPath, $OutputPath)
            $replacementBackupPath = $null
        } catch {
            [Console]::Error.WriteLine(
                "Previous package recovery failed; backup retained at: {0}",
                $replacementBackupPath
            )
        }
    }
    if ($temporaryOutputPath -and (Test-Path -LiteralPath $temporaryOutputPath -PathType Leaf)) {
        Remove-Item -LiteralPath $temporaryOutputPath -Force -ErrorAction SilentlyContinue
    }
    if (
        $replacementCompleted -and
        $replacementBackupPath -and
        (Test-Path -LiteralPath $replacementBackupPath -PathType Leaf)
    ) {
        Remove-Item -LiteralPath $replacementBackupPath -Force -ErrorAction SilentlyContinue
    }
    if ($stagingDirectory -and (Test-Path -LiteralPath $stagingDirectory -PathType Container)) {
        Remove-Item -LiteralPath $stagingDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
}
