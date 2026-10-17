# Generates your own release keystore (Windows). Every update must be signed with the same key.
param([string]$Out = "nexus-release.keystore")
$pass = Read-Host "Пароль для keystore (минимум 6 символов)" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass))
keytool -genkeypair -v -keystore $Out -alias nexus -keyalg RSA -keysize 4096 -validity 10000 -storepass $plain -keypass $plain -dname "CN=Nexus, O=Personal"
Write-Host "Готово: $Out"
Write-Host "Сборка: `$env:NEXUS_KEYSTORE_PATH='$((Resolve-Path $Out).Path)'; `$env:NEXUS_KEY_ALIAS='nexus'; `$env:NEXUS_KEYSTORE_PASSWORD='***'; `$env:NEXUS_KEY_PASSWORD='***'; pnpm apk"
