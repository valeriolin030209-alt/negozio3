#!/usr/bin/env python3
"""Genera un QR code PNG per il link pubblico del catalogo.

Uso:
  python3 generate_qr.py https://nome-negozio.netlify.app

Output:
  qr-catalogo.png
"""
import sys
from pathlib import Path

try:
    import qrcode
except ImportError as exc:
    raise SystemExit("Installa prima la libreria: pip install qrcode[pil]") from exc


def main() -> None:
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        raise SystemExit("Uso: python3 generate_qr.py <URL-pubblico-del-catalogo>")
    url = sys.argv[1].strip()
    output = Path("qr-catalogo.png")
    img = qrcode.make(url)
    img.save(output)
    print(f"QR generato: {output.resolve()}")


if __name__ == "__main__":
    main()
