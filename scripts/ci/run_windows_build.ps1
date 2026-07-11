[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Builder,[Parameter(Mandatory=$true)][string]$Image,[string]$LogDirectory="_ci-logs")
$ErrorActionPreference="Stop"; $results=[System.Collections.Generic.List[object]]::new(); New-Item -ItemType Directory -Force $LogDirectory|Out-Null
function Save-Results { @($results)|ConvertTo-Json -Depth 4|Out-File (Join-Path $LogDirectory "stages.json") -Encoding utf8 }
function Invoke-Stage([string]$Name,[string]$DisplayName,[string]$Command,[string[]]$Arguments) {
  $ErrorActionPreference="Continue"; $started=[DateTimeOffset]::UtcNow; $log=Join-Path $LogDirectory "$Name.log"; Write-Host "::group::$DisplayName"
  & $Command @Arguments 2>&1|ForEach-Object{$line=$_.ToString();Write-Host $line;$line|Add-Content $log -Encoding utf8};$code=$LASTEXITCODE;Write-Host "::endgroup::";$finished=[DateTimeOffset]::UtcNow
  $results.Add([pscustomobject]@{name=$Name;display_name=$DisplayName;status=$(if($code-eq 0){"success"}else{"failure"});exit_code=$code;started_at=$started.ToString("o");finished_at=$finished.ToString("o");duration_seconds=[math]::Round(($finished-$started).TotalSeconds,2);log_file=$log});Save-Results;return $code
}
$setup="docker buildx inspect $Builder >NUL 2>NUL`r`nif errorlevel 1 docker buildx create --name $Builder --driver docker-container --use`r`ndocker buildx use $Builder`r`nif errorlevel 1 exit /b %ERRORLEVEL%`r`ndocker buildx inspect --builder $Builder --bootstrap"
$code=Invoke-Stage "builder-setup" "Buildx builder setup" "cmd.exe" @("/d","/s","/c",$setup);if($code-ne 0){exit $code}
$code=Invoke-Stage "test-target" "Docker test target" "docker" @("buildx","build","--builder",$Builder,"--target","test","--no-cache-filter","test","--progress","plain","--provenance=false",".");if($code-ne 0){exit $code}
$args=@("buildx","build","--builder",$Builder,"--target","production","--load","--progress","plain","--provenance=false","--build-arg","NEXT_PUBLIC_AUTH_SERVICE_BASE_URL=$env:NEXT_PUBLIC_AUTH_SERVICE_BASE_URL","--build-arg","NEXT_PUBLIC_AUTH_SERVICE_CLIENT_ID=$env:NEXT_PUBLIC_AUTH_SERVICE_CLIENT_ID","--build-arg","NEXT_PUBLIC_AUTH_CALLBACK_URL=$env:NEXT_PUBLIC_AUTH_CALLBACK_URL","--build-arg","API_BACKEND_URL=http://fusion-api:8000","-t",$Image,".")
for($attempt=1;$attempt-le 3;$attempt++){ $code=Invoke-Stage "production-build-attempt-$attempt" "Production build (attempt $attempt)" "docker" $args;if($code-eq 0){exit 0};if($attempt-lt 3){Start-Sleep -Seconds (20*$attempt)} };exit $code
