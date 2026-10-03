$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$nrSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$nrSynth.SelectVoice('Microsoft Huihui Desktop')
$nrSynth.Rate = 1
$nrLines = Get-Content -LiteralPath 'tmp/night-rain-voice-lines.json' -Raw -Encoding utf8 | ConvertFrom-Json
try {
  foreach ($nrLine in $nrLines) {
    $nrMp3 = Join-Path 'public/games/night-rain/audio/voice' ($nrLine.id + '.mp3')
    if (Test-Path -LiteralPath $nrMp3) { continue }
    $nrWav = [System.IO.Path]::GetFullPath((Join-Path 'tmp/night-rain-voice-wav' ($nrLine.id + '.wav')))
    $nrSynth.SetOutputToWaveFile($nrWav)
    $nrText = $nrLine.text.Replace('按 C', '打开精灵面板').Replace('按 E', '使用交互').Replace('按 N', '打开手记').Replace('R 喝', '使用药瓶喝').Replace('Q 锁定', '锁定敌人')
    $nrSynth.Speak($nrText)
    $nrSynth.SetOutputToNull()
    & 'D:\tools\ffmpeg\bin\ffmpeg.exe' -v error -y -i $nrWav -ac 1 -ar 24000 -b:a 48k $nrMp3
    if ($LASTEXITCODE -ne 0) { throw 'Voice encoding failed' }
  }
} finally { $nrSynth.Dispose() }
Write-Output ('Baked {0} voice lines without audio playback' -f $nrLines.Count)
