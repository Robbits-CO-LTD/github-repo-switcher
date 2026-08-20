[CmdletBinding()]
param(
    [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot '..\src\repositories.generated.js'
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) was not found.'
}

& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI is not authenticated. Run: gh auth login'
}

$endpoint = 'user/repos?visibility=all&affiliation=owner,collaborator,organization_member&per_page=100&sort=full_name&direction=asc'
$rawJson = & gh api --paginate --slurp -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2026-03-10' $endpoint
if ($LASTEXITCODE -ne 0) {
    throw 'GitHub repository discovery failed.'
}

$pages = $rawJson | ConvertFrom-Json
$byName = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::OrdinalIgnoreCase)

foreach ($page in $pages) {
    foreach ($repository in $page) {
        if ([string]::IsNullOrWhiteSpace($repository.full_name)) {
            continue
        }

        $item = [ordered]@{
            nwo      = [string]$repository.full_name
            name     = [string]$repository.name
            owner    = [string]$repository.owner.login
            private  = [bool]$repository.private
            archived = [bool]$repository.archived
            hasIssues = [bool]$repository.has_issues
        }

        $byName[$item.nwo] = $item
    }
}

$repositories = @($byName.Values | Sort-Object { $_.nwo.ToLowerInvariant() })
$json = ConvertTo-Json -InputObject @($repositories) -Depth 4 -Compress
$content = @"
globalThis.RepoSignalSeed = Object.freeze(($json).map((repository) => Object.freeze(repository)));
"@

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$parentDirectory = Split-Path -Parent $resolvedOutput
[System.IO.Directory]::CreateDirectory($parentDirectory) | Out-Null
[System.IO.File]::WriteAllText($resolvedOutput, $content, [System.Text.UTF8Encoding]::new($false))

$ownerCount = @($repositories | ForEach-Object { $_.owner } | Sort-Object -Unique).Count
Write-Output ("Generated {0} repositories from {1} owners." -f $repositories.Count, $ownerCount)
