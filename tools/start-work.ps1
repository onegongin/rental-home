# 작업 시작 — 어느 PC에서든 더블클릭(작업시작.cmd) → 사이트를 고르면 최신본을 받아 VS Code 로 엽니다 (2026-11-15 대표 요청)
#  - 작업 폴더는 각 PC 내장 디스크 C:\클로드코드\<사이트> (외장 SSD exFAT 는 2026-11-14 손상 → 직접 작업 금지)
#  - 첨단대라수1차(rental-home): C: 에 없으면 GitHub 에서 새로 받고, git 에 없는 파일(.dev.vars · 고객DB_양식.xlsx · 참고 사이트 원본)은 SSD 에서 복사
#  - 아이파크 · 123공실: 각자 규칙이 있어 자동으로 옮기지 않음 — C: 에 있으면 C:, 없으면 SSD 폴더를 열고 안내만
# 여러 번 실행해도 안전합니다.
$ErrorActionPreference = 'Continue'
$Root = 'C:\클로드코드'   # $c(사이트 폴더)와 이름이 겹치지 않게 — PowerShell 은 변수 대소문자를 구분하지 않음
$Sites = @(
  @{ n = '첨단대라수1차 (rental-home)';      d = 'site_rental-home'; url = 'https://github.com/onegongin/rental-home.git';   br = 'preview'; auto = $true },
  @{ n = '화정아이파크 (site_Ipark)';          d = 'site_Ipark';       url = 'https://github.com/onegongin/hwajeong-ipark.git'; br = 'preview'; auto = $false },
  @{ n = '123공실 · 광주 오피스텔 (site_op)';  d = 'site_op';          url = 'https://github.com/onegongin/123GongSil.git';     br = 'main';    auto = $false }
)
function Ok($t)   { Write-Host "  [완료] $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  [확인] $t" -ForegroundColor Yellow }
function Last($dir) { $l = git -c safe.directory=* -C $dir log -1 --format='%ad  %s' --date=format:'%Y-%m-%d %H:%M' 2>$null; if ($l) { $l } else { '(기록 없음)' } }

# 외장 SSD 의 클로드코드 폴더 (드라이브 글자가 PC 마다 달라도 찾음)
$ssd = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -ne 'C:\' } |
  ForEach-Object { Join-Path $_.Root '클로드코드' } | Where-Object { Test-Path $_ } | Select-Object -First 1

Write-Host ''
Write-Host '==== 어느 사이트를 이어서 할까요? ====' -ForegroundColor Cyan
for ($i = 0; $i -lt $Sites.Count; $i++) {
  $p = $Sites[$i]; $c = Join-Path $Root $p.d
  $where = if (Test-Path "$c\.git") { "C: 있음 · 마지막 작업 $(Last $c)" } elseif ($ssd -and (Test-Path (Join-Path $ssd $p.d))) { 'C: 없음 (SSD 에만 있음)' } else { 'C: 없음' }
  Write-Host ("  {0}. {1}" -f ($i + 1), $p.n) -ForegroundColor White
  Write-Host ("     {0}" -f $where) -ForegroundColor DarkGray
}
Write-Host ''
$k = Read-Host '번호를 고르세요 (1~3, 그냥 Enter = 1)'
if (-not $k) { $k = '1' }
$p = $Sites[[int]$k - 1]
if (-not $p) { Write-Host '번호가 틀렸습니다.'; exit 1 }
$c = Join-Path $Root $p.d
Write-Host ''
Write-Host "▶ $($p.n)" -ForegroundColor Cyan

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Warn 'Git 이 없습니다: https://git-scm.com/download/win 설치 후 다시 실행'; exit 1 }

if ($p.auto) {
  if (-not (Test-Path "$c\.git")) {
    New-Item -ItemType Directory -Force $Root | Out-Null
    Write-Host '  GitHub 에서 처음 받습니다 (1분 정도)...'
    git -c core.longpaths=true clone -q --branch $p.br $p.url $c
    git -C $c config core.autocrlf false                 # 줄바꿈 그대로 (바뀌면 시험 2개 실패)
    git -C $c branch -m $p.br main
    git -C $c branch -u "origin/$($p.br)" main | Out-Null
    git -C $c config push.default upstream
    git -C $c rm -r --cached -q . ; git -C $c reset -q --hard
    Ok "받음: $c"
  } else {
    git -C $c config core.autocrlf false
    $dirty = git -C $c status --porcelain --untracked-files=no
    if ($dirty) { Warn '아직 커밋 안 한 변경이 있어 최신본 받기를 건너뜁니다 — Claude 에게 "커밋하고 이어서" 라고 말해 주세요' }
    else { git -C $c pull -q --ff-only; if ($LASTEXITCODE -eq 0) { Ok '최신본 받음 (GitHub preview)' } else { Warn '최신본을 받지 못했습니다 — Claude 에게 알려 주세요' } }
  }
  # git 에 없는 파일: SSD 에서 (이 PC 에 없을 때만)
  if ($ssd) {
    $s = Join-Path $ssd $p.d
    foreach ($f in '.dev.vars', '소스\DAELASOO\고객DB_양식.xlsx', '소스\DAELASOO\전세상승.png') {
      if ((Test-Path (Join-Path $s $f)) -and -not (Test-Path (Join-Path $c $f))) { New-Item -ItemType Directory -Force (Split-Path (Join-Path $c $f)) | Out-Null; Copy-Item (Join-Path $s $f) (Join-Path $c $f); Ok "SSD 에서 복사: $f" }
    }
    $ref = '소스\DAELASOO\참고만_CD_DaelaSoo1-main'
    if ((Test-Path (Join-Path $s $ref)) -and -not (Test-Path (Join-Path $c $ref))) { Copy-Item (Join-Path $s $ref) (Join-Path $c $ref) -Recurse; Ok "SSD 에서 복사: $ref" }
  }
  if (-not (Test-Path "$c\.dev.vars")) { Warn '.dev.vars(로컬 사무실 코드) 없음 — 직원 화면 연습이 필요하면 Claude 에게 만들어 달라고 하세요' }
  if ((Get-Command npm -ErrorAction SilentlyContinue) -and -not (Test-Path "$c\node_modules")) { Write-Host '  npm 패키지 설치 (1~2분)...'; Push-Location $c; npm ci --no-audit --no-fund | Out-Null; Pop-Location; Ok 'npm 패키지' }
  $open = $c
} else {
  if (Test-Path "$c\.git") { git -C $c pull -q --ff-only 2>$null; $open = $c; Ok "C: 폴더: $c" }
  elseif ($ssd -and (Test-Path (Join-Path $ssd $p.d))) {
    $open = Join-Path $ssd $p.d
    git config --global --get-all safe.directory | Out-Null
    git config --global --add safe.directory ($open -replace '\\', '/')
    Warn "이 사이트는 아직 SSD 에서 작업합니다: $open"
    Warn '내장 디스크로 옮기려면 그 창의 Claude 에게: "GitHub 에서 C:\클로드코드 로 새로 받아 줘"'
  } else { Warn '이 PC 에도 SSD 에도 폴더가 없습니다 — Claude 에게 GitHub 에서 받아 달라고 하세요'; exit 1 }
}

Write-Host ''
Write-Host "  마지막 작업: $(Last $open)" -ForegroundColor Cyan
Write-Host "  VS Code 로 엽니다: $open" -ForegroundColor Cyan
Write-Host '  열리면 Claude 에게 "이어서 할게" 라고 말해 주세요.' -ForegroundColor Cyan
if ($env:START_WORK_NOOPEN) { Ok "(시험 실행 — 열지 않음)" } elseif (Get-Command code -ErrorAction SilentlyContinue) { code $open } else { Warn 'VS Code 명령(code)을 찾지 못했습니다 — VS Code 에서 [파일 > 폴더 열기] 로 위 폴더를 여세요'; Start-Process explorer.exe $open }
