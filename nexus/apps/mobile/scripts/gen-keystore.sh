#!/usr/bin/env bash
# Generates your own release keystore. Keep it and its passwords safe: every update must be signed with the same key.
set -euo pipefail
OUT="${1:-nexus-release.keystore}"
read -r -s -p "Пароль для keystore (минимум 6 символов): " PASS; echo
keytool -genkeypair -v -keystore "$OUT" -alias nexus -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$PASS" -keypass "$PASS" -dname "CN=Nexus, O=Personal"
echo
echo "Готово: $OUT"
echo "Сборка с этим ключом:"
echo "  export NEXUS_KEYSTORE_PATH=\"$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")\" NEXUS_KEY_ALIAS=nexus NEXUS_KEYSTORE_PASSWORD=*** NEXUS_KEY_PASSWORD=***"
echo "Для GitHub Actions: base64 -w0 $OUT > keystore.b64 и добавьте секреты NEXUS_KEYSTORE_BASE64, NEXUS_KEYSTORE_PASSWORD."
