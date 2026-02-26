"""QR Code provisioning for Device Owner mode."""
import io
import base64
import json
import qrcode
from fastapi import APIRouter, Query
from utils.auth import get_admin_id_from_token

router = APIRouter(prefix="/api/provisioning", tags=["provisioning"])


@router.get("/qr-code")
async def generate_provisioning_qr(
    admin_token: str = Query(...),
    wifi_ssid: str = Query(""),
    wifi_password: str = Query(""),
    wifi_security: str = Query("WPA"),
):
    """Generate a QR code for Android Device Owner provisioning.
    
    This QR code follows the Android zero-touch enrollment format.
    When scanned during device setup (tap 6 times on welcome screen),
    it will provision the device with PayLock Pro as Device Owner.
    """
    await get_admin_id_from_token(admin_token)
    
    # Android Device Owner provisioning payload
    # https://developer.android.com/work/dpc/build-dpc#provisioning_methods
    provisioning_data = {
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME":
            "com.paylock.client/.DeviceAdminReceiver",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION":
            "https://paylock.pro/downloads/client.apk",
        "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": True,
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": True,
    }
    
    # Add WiFi config if provided
    if wifi_ssid:
        provisioning_data["android.app.extra.PROVISIONING_WIFI_SSID"] = wifi_ssid
        if wifi_password:
            provisioning_data["android.app.extra.PROVISIONING_WIFI_PASSWORD"] = wifi_password
        provisioning_data["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] = wifi_security
    
    # Generate QR code
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(json.dumps(provisioning_data))
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Convert to base64
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    qr_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    
    return {
        "qr_code_base64": qr_base64,
        "provisioning_data": provisioning_data,
        "instructions": {
            "en": [
                "1. Factory reset the target device",
                "2. On the welcome screen, tap 6 times rapidly",
                "3. Connect to WiFi when prompted",
                "4. Scan this QR code with the device camera",
                "5. The device will automatically download and install PayLock Pro",
                "6. PayLock Pro will be set as Device Owner",
            ],
            "et": [
                "1. Tehaseseadistage sihtseade",
                "2. Tervitusekraanil puudutage 6 korda kiirelt",
                "3. Ühenduge WiFi-ga, kui palutakse",
                "4. Skaneerige see QR-kood seadme kaameraga",
                "5. Seade laadib alla ja installib PayLock Pro automaatselt",
                "6. PayLock Pro seadistatakse Device Owner'iks",
            ],
        }
    }


@router.get("/nfc-payload")
async def get_nfc_provisioning_payload(
    admin_token: str = Query(...),
    wifi_ssid: str = Query(""),
    wifi_password: str = Query(""),
    wifi_security: str = Query("WPA"),
):
    """Get NFC provisioning payload for Device Owner activation.
    
    Returns the NDEF record data that should be written to an NFC tag.
    When the NFC tag is tapped to a factory-reset device during initial setup,
    it will automatically provision the device with PayLock Pro as Device Owner.
    
    The payload follows Android's NFC provisioning format using 
    MIME type 'application/com.android.managedprovisioning'.
    """
    await get_admin_id_from_token(admin_token)
    
    # Build provisioning properties (Java Properties format for NFC)
    properties_lines = [
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME=com.paylock.client/.DeviceAdminReceiver",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION=https://paylock.pro/downloads/client.apk",
        "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM=",
        "android.app.extra.PROVISIONING_SKIP_ENCRYPTION=true",
        "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED=true",
    ]
    
    if wifi_ssid:
        properties_lines.append(f"android.app.extra.PROVISIONING_WIFI_SSID={wifi_ssid}")
        if wifi_password:
            properties_lines.append(f"android.app.extra.PROVISIONING_WIFI_PASSWORD={wifi_password}")
        properties_lines.append(f"android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE={wifi_security}")
    
    nfc_payload = "\n".join(properties_lines)
    nfc_payload_base64 = base64.b64encode(nfc_payload.encode("utf-8")).decode("utf-8")
    
    return {
        "mime_type": "application/com.android.managedprovisioning",
        "payload_text": nfc_payload,
        "payload_base64": nfc_payload_base64,
        "payload_size_bytes": len(nfc_payload.encode("utf-8")),
        "instructions": {
            "en": [
                "1. Use an NFC writing app (e.g., NFC Tools) on an admin device",
                "2. Select 'Write' > 'Add record' > 'Custom MIME type'",
                "3. Set MIME type to: application/com.android.managedprovisioning",
                "4. Paste the payload text as the record content",
                "5. Write to an NFC tag (NTAG215 or larger recommended)",
                "6. Factory reset the target device",
                "7. Tap the NFC tag to the device during the initial setup screen",
                "8. The device will provision automatically with PayLock Pro as Device Owner",
            ],
            "et": [
                "1. Kasutage NFC kirjutamise rakendust (nt NFC Tools) admin seadmes",
                "2. Valige 'Write' > 'Add record' > 'Custom MIME type'",
                "3. Seadke MIME-tüübiks: application/com.android.managedprovisioning",
                "4. Kleepige payload tekst sisu väljale",
                "5. Kirjutage NFC-märgisele (NTAG215 või suurem soovitatav)",
                "6. Tehaseseadistage sihtseade",
                "7. Puudutage NFC-märgist seadmega algse seadistamise ekraanil",
                "8. Seade seadistatakse automaatselt PayLock Pro Device Owner'iks",
            ],
        }
    }
