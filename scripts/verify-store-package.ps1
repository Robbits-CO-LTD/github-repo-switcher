[CmdletBinding()]
param(
    [string]$ProjectRoot = '',
    [string]$PackagePath = ''
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

function Get-ZipEntryBytes {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.Compression.ZipArchiveEntry]$Entry
    )

    $inputStream = $null
    $memoryStream = $null
    try {
        $inputStream = $Entry.Open()
        $memoryStream = [System.IO.MemoryStream]::new()
        $inputStream.CopyTo($memoryStream)
        return ,$memoryStream.ToArray()
    } finally {
        if ($memoryStream) {
            $memoryStream.Dispose()
        }
        if ($inputStream) {
            $inputStream.Dispose()
        }
    }
}

function Test-ByteSequence {
    param(
        [byte[]]$Left,
        [byte[]]$Right
    )

    if ($Left.Length -ne $Right.Length) {
        return $false
    }

    for ($index = 0; $index -lt $Left.Length; $index += 1) {
        if ($Left[$index] -ne $Right[$index]) {
            return $false
        }
    }

    return $true
}

function Assert-PngDimensions {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [int]$Width,
        [Parameter(Mandatory = $true)]
        [int]$Height,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Label was not found."
    }

    $image = $null
    try {
        $image = [System.Drawing.Image]::FromFile($Path)
        if ($image.Width -ne $Width -or $image.Height -ne $Height) {
            throw "$Label must be ${Width}x${Height}."
        }
    } finally {
        if ($image) {
            $image.Dispose()
        }
    }
}

$safeSeed = "globalThis.RepoSignalSeed = Object.freeze([]);`n"
$expectedEntries = @(
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
    'src/options/options.js',
    'src/repositories.generated.js'
)
$forbiddenDevelopmentPath = '(?i)(^|/)(?:\.git(?:/|$)|\.github(?:/|$)|node_modules(?:/|$)|tests?(?:/|$)|coverage(?:/|$)|dist(?:/|$)|scripts?(?:/|$)|tasks?(?:/|$)|\.env(?:$|\.)|package-lock\.json$|README(?:\.md)?$|vitest\.config\.(?:js|mjs)$|repositories\.example\.js$)'
$secretMarkerPatterns = @(
    'SENSITIVE-SEED-SENTINEL',
    '(?i)-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----',
    '(?i)\bghp_[A-Za-z0-9]{20,}\b',
    '(?i)\bgithub_pat_[A-Za-z0-9_]{20,}\b',
    '\bAKIA[0-9A-Z]{16}\b',
    '(?i)\bAIza[0-9A-Za-z_-]{20,}\b',
    '(?i)\bxox[baprs]-[A-Za-z0-9-]{10,}',
    '(?i)\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["'']?[^ \r\n]+'
)

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = Join-Path $PSScriptRoot '..'
}

$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    throw "Project root was not found: $ProjectRoot"
}

$manifestPath = Join-Path $ProjectRoot 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "Manifest was not found: $manifestPath"
}

$sourceManifest = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
$version = [string]$sourceManifest.version
if ([string]::IsNullOrWhiteSpace($version)) {
    throw 'Manifest version is required.'
}

if ([string]::IsNullOrWhiteSpace($PackagePath)) {
    $PackagePath = Join-Path (Join-Path $ProjectRoot 'dist') ("repo-signal-{0}.zip" -f $version)
} elseif (-not [System.IO.Path]::IsPathRooted($PackagePath)) {
    $PackagePath = Join-Path $ProjectRoot $PackagePath
}

$PackagePath = [System.IO.Path]::GetFullPath($PackagePath)
if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) {
    throw "Store package was not found: $PackagePath"
}

if ([System.IO.Path]::GetFileName($PackagePath) -cne ("repo-signal-{0}.zip" -f $version)) {
    throw 'Store package filename does not match the manifest version.'
}

try {
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    Add-Type -AssemblyName System.Drawing

    $expectedSet = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::Ordinal
    )
    foreach ($expectedEntry in $expectedEntries) {
        [void]$expectedSet.Add($expectedEntry)
    }

    $archiveStream = $null
    $archive = $null
    try {
        $archiveStream = [System.IO.File]::Open(
            $PackagePath,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::Read
        )
        $archive = [System.IO.Compression.ZipArchive]::new(
            $archiveStream,
            [System.IO.Compression.ZipArchiveMode]::Read,
            $false
        )

        $seenEntries = [System.Collections.Generic.HashSet[string]]::new(
            [System.StringComparer]::Ordinal
        )
        $entriesByName = [System.Collections.Generic.Dictionary[string, System.IO.Compression.ZipArchiveEntry]]::new(
            [System.StringComparer]::Ordinal
        )

        foreach ($entry in $archive.Entries) {
            if ([string]::IsNullOrWhiteSpace($entry.FullName) -or $entry.FullName.EndsWith('/')) {
                throw 'Store package contains a directory entry.'
            }
            if (-not $expectedSet.Contains($entry.FullName)) {
                throw 'Store package contains an unexpected path.'
            }
            if (-not $seenEntries.Add($entry.FullName)) {
                throw 'Store package contains a duplicate path.'
            }
            $entriesByName.Add($entry.FullName, $entry)
        }

        if ($seenEntries.Count -ne $expectedEntries.Count) {
            throw 'Store package does not contain exactly the required files.'
        }
        foreach ($expectedEntry in $expectedEntries) {
            if (-not $entriesByName.ContainsKey($expectedEntry)) {
                throw 'Store package is missing a required file.'
            }
        }

        foreach ($entryName in $seenEntries) {
            if ($entryName -match $forbiddenDevelopmentPath) {
                throw 'Store package contains a forbidden development file.'
            }
        }

        [byte[]]$manifestBytes = Get-ZipEntryBytes $entriesByName['manifest.json']
        $packagedManifest = [System.Text.Encoding]::UTF8.GetString($manifestBytes) | ConvertFrom-Json
        if ([string]$packagedManifest.version -cne $version) {
            throw 'Packaged manifest version does not match the source manifest.'
        }
        if ([string]$packagedManifest.name -cne [string]$sourceManifest.name) {
            throw 'Packaged manifest name does not match the source manifest.'
        }

        [byte[]]$seedBytes = Get-ZipEntryBytes $entriesByName['src/repositories.generated.js']
        [byte[]]$expectedSeedBytes = [System.Text.UTF8Encoding]::new($false).GetBytes($safeSeed)
        if (-not (Test-ByteSequence $seedBytes $expectedSeedBytes)) {
            throw 'Packaged repository seed is not the required empty seed.'
        }

        foreach ($entry in $archive.Entries) {
            $extension = [System.IO.Path]::GetExtension($entry.FullName).ToLowerInvariant()
            if ($extension -notin @('.js', '.json', '.html', '.css', '.md', '.txt')) {
                continue
            }

            [byte[]]$entryBytes = Get-ZipEntryBytes $entry
            $text = [System.Text.Encoding]::UTF8.GetString($entryBytes)
            foreach ($pattern in $secretMarkerPatterns) {
                if ($text -match $pattern) {
                    throw 'Store package contains a prohibited secret marker.'
                }
            }
        }

        if (-not $entriesByName.ContainsKey('icons/repo-signal-128.png')) {
            throw 'Store package is missing the 128x128 icon.'
        }
    } finally {
        if ($archive) {
            $archive.Dispose()
        }
        if ($archiveStream) {
            $archiveStream.Dispose()
        }
    }

    Assert-PngDimensions `
        -Path (Join-Path $ProjectRoot 'icons\repo-signal-128.png') `
        -Width 128 `
        -Height 128 `
        -Label 'Store icon'
    Assert-PngDimensions `
        -Path (Join-Path $ProjectRoot 'store\assets\screenshot-01-1280x800-clean.png') `
        -Width 1280 `
        -Height 800 `
        -Label 'Store screenshot'
    Assert-PngDimensions `
        -Path (Join-Path $ProjectRoot 'store\assets\promo-small.png') `
        -Width 440 `
        -Height 280 `
        -Label 'Store promotional image'

    $hash = Get-Sha256Hex -Path $PackagePath
    Write-Output ("PASS: store package verified (version {0}, {1} files)." -f $version, $expectedEntries.Count)
    Write-Output ("SHA-256: {0}" -f $hash)
} catch {
    [Console]::Error.WriteLine("Store package verification failed: {0}", $_.Exception.Message)
    exit 1
}
