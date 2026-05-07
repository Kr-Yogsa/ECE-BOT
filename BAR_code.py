import qrcode

qr = qrcode.QRCode(
    version=1,
    error_correction=qrcode.constants.ERROR_CORRECT_H,  # High error correction
    box_size=10,
    border=4
)

qr.add_data("https://ece-bot-zd84.onrender.com")
qr.make(fit=True)

img = qr.make_image(fill_color="black", back_color="white")
img.save("ece_bot_qr_hd.png")