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

function Read-UInt32BigEndian {
    param(
        [Parameter(Mandatory = $true)]
        [byte[]]$Bytes,
        [Parameter(Mandatory = $true)]
        [int]$Offset
    )

    return [uint32](
        ([uint64]$Bytes[$Offset] * 16777216) +
        ([uint64]$Bytes[$Offset + 1] * 65536) +
        ([uint64]$Bytes[$Offset + 2] * 256) +
        [uint64]$Bytes[$Offset + 3]
    )
}

function Get-Crc32 {
    param(
        [Parameter(Mandatory = $true)]
        [byte[]]$Bytes
    )

    [uint32]$crc = [uint32]::MaxValue
    [uint32]$polynomial = 3988292384
    foreach ($byte in $Bytes) {
        $crc = [uint32]($crc -bxor [uint32]$byte)
        for ($bit = 0; $bit -lt 8; $bit += 1) {
            if (($crc -band 1) -eq 1) {
                $crc = [uint32](($crc -shr 1) -bxor $polynomial)
            } else {
                $crc = [uint32]($crc -shr 1)
            }
        }
    }

    return [uint32]($crc -bxor [uint32]::MaxValue)
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
        [string]$EntryName
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "PNG entry was not found: $EntryName"
    }

    [byte[]]$pngBytes = [System.IO.File]::ReadAllBytes($Path)
    [byte[]]$signature = 137, 80, 78, 71, 13, 10, 26, 10
    if ($pngBytes.Length -lt $signature.Length) {
        throw "Invalid PNG structure: $EntryName"
    }
    for ($index = 0; $index -lt $signature.Length; $index += 1) {
        if ($pngBytes[$index] -ne $signature[$index]) {
            throw "Invalid PNG structure: $EntryName"
        }
    }

    $offset = $signature.Length
    $chunkIndex = 0
    $sawImageData = $false
    $sawImageEnd = $false
    while ($offset -lt $pngBytes.Length) {
        if ($pngBytes.Length - $offset -lt 12) {
            throw "Invalid PNG structure: $EntryName"
        }

        [uint32]$chunkLength = Read-UInt32BigEndian -Bytes $pngBytes -Offset $offset
        [uint64]$chunkEnd = [uint64]$offset + 12 + [uint64]$chunkLength
        if ($chunkLength -gt [int]::MaxValue -or $chunkEnd -gt [uint64]$pngBytes.Length) {
            throw "Invalid PNG structure: $EntryName"
        }

        $typeOffset = $offset + 4
        $dataOffset = $offset + 8
        $crcOffset = $dataOffset + [int]$chunkLength
        $chunkType = [System.Text.Encoding]::ASCII.GetString($pngBytes, $typeOffset, 4)
        [byte[]]$crcInput = New-Object byte[] (4 + [int]$chunkLength)
        [System.Array]::Copy($pngBytes, $typeOffset, $crcInput, 0, $crcInput.Length)
        [uint32]$expectedCrc = Read-UInt32BigEndian -Bytes $pngBytes -Offset $crcOffset
        [uint32]$actualCrc = Get-Crc32 -Bytes $crcInput
        if ($actualCrc -ne $expectedCrc) {
            throw "Invalid PNG checksum: $EntryName"
        }

        if ($chunkIndex -eq 0) {
            if ($chunkType -ne 'IHDR' -or $chunkLength -ne 13) {
                throw "Invalid PNG structure: $EntryName"
            }
            [uint32]$actualWidth = Read-UInt32BigEndian -Bytes $pngBytes -Offset $dataOffset
            [uint32]$actualHeight = Read-UInt32BigEndian -Bytes $pngBytes -Offset ($dataOffset + 4)
            if ($actualWidth -ne $Width -or $actualHeight -ne $Height) {
                throw "Invalid PNG dimensions: $EntryName"
            }
        } elseif ($chunkType -eq 'IHDR') {
            throw "Invalid PNG structure: $EntryName"
        }

        if ($chunkType -eq 'IDAT') {
            $sawImageData = $true
        }
        if ($chunkType -eq 'IEND') {
            if ($chunkLength -ne 0 -or $chunkEnd -ne [uint64]$pngBytes.Length) {
                throw "Invalid PNG structure: $EntryName"
            }
            $sawImageEnd = $true
        } elseif ($sawImageEnd) {
            throw "Invalid PNG structure: $EntryName"
        }

        $offset = [int]$chunkEnd
        $chunkIndex += 1
    }

    if (-not $sawImageData -or -not $sawImageEnd) {
        throw "Invalid PNG structure: $EntryName"
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
    '(?i)\b(?:api[_-]?key|access[_-]?token|secret|password)\b["'']?\s*[:=]\s*["'']?[^ \r\n"'',}]+'
)

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

$sourceManifest = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
$version = [string]$sourceManifest.version
if ([string]::IsNullOrWhiteSpace($version)) {
    throw 'Manifest version is required.'
}

if ([string]::IsNullOrWhiteSpace($PackagePath)) {
    $PackagePath = Join-Path (Get-ProjectEntryPath -Root $ProjectRoot -EntryName 'dist') (
        "repo-signal-{0}.zip" -f $version
    )
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

        foreach ($expectedEntry in $expectedEntries) {
            if ($expectedEntry -eq 'src/repositories.generated.js') {
                continue
            }

            $sourcePath = Get-ProjectEntryPath -Root $ProjectRoot -EntryName $expectedEntry
            if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
                throw "Source package entry was not found: $expectedEntry"
            }

            [byte[]]$sourceBytes = [System.IO.File]::ReadAllBytes($sourcePath)
            [byte[]]$packagedBytes = Get-ZipEntryBytes $entriesByName[$expectedEntry]
            if (-not (Test-ByteSequence $sourceBytes $packagedBytes)) {
                throw "Store package entry differs from source: $expectedEntry"
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
        -Path (Get-ProjectEntryPath -Root $ProjectRoot -EntryName 'icons/repo-signal-128.png') `
        -Width 128 `
        -Height 128 `
        -EntryName 'icons/repo-signal-128.png'
    Assert-PngDimensions `
        -Path (Get-ProjectEntryPath -Root $ProjectRoot -EntryName 'store/assets/screenshot-01-1280x800-clean.png') `
        -Width 1280 `
        -Height 800 `
        -EntryName 'store/assets/screenshot-01-1280x800-clean.png'
    Assert-PngDimensions `
        -Path (Get-ProjectEntryPath -Root $ProjectRoot -EntryName 'store/assets/promo-small.png') `
        -Width 440 `
        -Height 280 `
        -EntryName 'store/assets/promo-small.png'

    $hash = Get-Sha256Hex -Path $PackagePath
    Write-Output ("PASS: store package verified (version {0}, {1} files)." -f $version, $expectedEntries.Count)
    Write-Output ("SHA-256: {0}" -f $hash)
} catch {
    [Console]::Error.WriteLine("Store package verification failed: {0}", $_.Exception.Message)
    exit 1
}
