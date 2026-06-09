#!/bin/bash
set -e

echo "=== Cài đặt cấu hình thiết bị Android ảo cục bộ ==="

# 1. Kiểm tra Android SDK / Command line tools
if [ -z "$ANDROID_HOME" ]; then
    echo "LỖI: Chưa cấu hình biến môi trường \$ANDROID_HOME."
    exit 1
fi

SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
AVDMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"

# 2. Tải System Image (Android 33 - API 33)
echo "Đang tải hệ điều hành Android 33..."
$SDKMANAGER "system-images;android-33;google_apis;x86_64"

# 3. Tạo thiết bị ảo
echo "Đang tạo AVD tên 'ForgewrightTestDevice'..."
echo "no" | $AVDMANAGER create avd -n ForgewrightTestDevice -k "system-images;android-33;google_apis;x86_64" --force

# 4. Tạo script khởi chạy background
cat << 'EOF' > scripts/start-emulator.sh
#!/bin/bash
echo "Khởi chạy máy ảo trong chế độ không hiển thị (headless)..."
$ANDROID_HOME/emulator/emulator -avd ForgewrightTestDevice -no-window -no-audio -no-boot-anim -gpu off &
EOF

chmod +x scripts/start-emulator.sh
echo "=== THÀNH CÔNG: Chạy 'bash scripts/start-emulator.sh' để khởi động máy ảo ==="
