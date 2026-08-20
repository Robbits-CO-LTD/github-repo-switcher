[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot '..\icons'
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

foreach ($size in @(16, 32, 48, 128)) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#080B0D'))

    $borderWidth = [Math]::Max(1, [Math]::Round($size * 0.045))
    $lineWidth = [Math]::Max(1, [Math]::Round($size * 0.055))
    $nodeRadius = [Math]::Max(2, [Math]::Round($size * 0.105))
    $centerY = [Math]::Round($size / 2)
    $leftX = [Math]::Round($size * 0.24)
    $middleX = [Math]::Round($size * 0.50)
    $rightX = [Math]::Round($size * 0.76)

    $borderPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#263039'), $borderWidth)
    $signalPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#2FE6A6'), $lineWidth)
    $surfaceBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#10161A'))
    $signalBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#2FE6A6'))

    $graphics.DrawRectangle($borderPen, $borderWidth / 2, $borderWidth / 2, $size - $borderWidth, $size - $borderWidth)
    $graphics.DrawLine($signalPen, $leftX, $centerY, $rightX, $centerY)

    foreach ($x in @($leftX, $rightX)) {
        $graphics.FillEllipse($surfaceBrush, $x - $nodeRadius, $centerY - $nodeRadius, $nodeRadius * 2, $nodeRadius * 2)
        $graphics.DrawEllipse($signalPen, $x - $nodeRadius, $centerY - $nodeRadius, $nodeRadius * 2, $nodeRadius * 2)
    }

    $activeRadius = [Math]::Round($nodeRadius * 1.18)
    $graphics.FillEllipse($signalBrush, $middleX - $activeRadius, $centerY - $activeRadius, $activeRadius * 2, $activeRadius * 2)

    $path = Join-Path $outputDirectory ("repo-signal-{0}.png" -f $size)
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

    $borderPen.Dispose()
    $signalPen.Dispose()
    $surfaceBrush.Dispose()
    $signalBrush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Output 'Generated Repo Signal icons.'
