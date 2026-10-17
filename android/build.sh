#!/usr/bin/env bash
# Сборка APK без Gradle: aapt + javac + dx + zipalign + apksigner.
# Ubuntu/Debian: sudo apt-get install -y openjdk-17-jdk-headless aapt dalvik-exchange zipalign apksigner curl
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/../release}"
BUILD="$ROOT/.build"
JAR="$BUILD/android-34.jar"
JAR_URL="https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar"
KS="$ROOT/keystore/konstruktor.jks"
KS_PASS="${KS_PASS:-konstruktor-dou}"
VERSION="$(grep -o 'android:versionName="[^"]*"' "$ROOT/AndroidManifest.xml" | cut -d'"' -f2)"
APK_NAME="Konstruktor-DOU-v${VERSION}.apk"

for t in javac aapt dalvik-exchange zipalign apksigner keytool curl; do
  command -v "$t" >/dev/null || { echo "Не найден инструмент: $t" >&2; exit 1; }
done

rm -rf "$BUILD/gen" "$BUILD/classes" "$BUILD"/*.apk "$BUILD"/*.dex
mkdir -p "$BUILD/gen" "$BUILD/classes" "$OUT_DIR"

if [ ! -s "$JAR" ]; then
  echo "Загрузка android.jar (API 34)…"
  curl -fsSL --retry 4 -o "$JAR.tmp" "$JAR_URL"
  mv "$JAR.tmp" "$JAR"
fi

echo "1/6 Ресурсы и ассеты"
aapt package -f -m \
  -M "$ROOT/AndroidManifest.xml" -S "$ROOT/res" -A "$ROOT/assets" \
  -I "$JAR" -J "$BUILD/gen" -F "$BUILD/app.unaligned.apk" \
  --min-sdk-version 24 --target-sdk-version 34 --no-version-vectors

echo "2/6 Компиляция Java"
javac -nowarn -encoding UTF-8 -source 8 -target 8 -bootclasspath "$JAR" -classpath "$JAR" \
  -d "$BUILD/classes" $(find "$ROOT/src" "$BUILD/gen" -name '*.java') 2>&1 | grep -v -E '^(warning|Note|Picked up)' || true
[ -f "$BUILD/classes/ru/dou/konstruktor/MainActivity.class" ] || { echo "Ошибка компиляции" >&2; exit 1; }

echo "3/6 DEX"
dalvik-exchange --dex --min-sdk-version=24 --output="$BUILD/classes.dex" "$BUILD/classes"

echo "4/6 Упаковка"
(cd "$BUILD" && aapt add -f app.unaligned.apk classes.dex >/dev/null)

echo "5/6 Выравнивание"
zipalign -f -p 4 "$BUILD/app.unaligned.apk" "$BUILD/app.aligned.apk"

echo "6/6 Подпись"
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -v -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias konstruktor \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Konstruktor DOU, O=DOU, C=RU" >/dev/null 2>&1
fi
apksigner sign --ks "$KS" --ks-pass "pass:$KS_PASS" --ks-key-alias konstruktor \
  --min-sdk-version 24 --out "$OUT_DIR/$APK_NAME" "$BUILD/app.aligned.apk"
apksigner verify "$OUT_DIR/$APK_NAME"
rm -f "$OUT_DIR/$APK_NAME.idsig"
echo "Готово: $OUT_DIR/$APK_NAME ($(du -h "$OUT_DIR/$APK_NAME" | cut -f1))"
