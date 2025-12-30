To show the CREA logo on the landing/header:
1) Download the image and save as frontend/public/crea-logo.jpeg
   Raw URL (works with wget/curl):
   https://raw.githubusercontent.com/ronvoy/CREA3/crea3.cc/_crea2-archive/crea-logo.jpeg

Windows PowerShell:
  iwr -Uri "https://raw.githubusercontent.com/ronvoy/CREA3/crea3.cc/_crea2-archive/crea-logo.jpeg" -OutFile "frontend/public/crea-logo.jpeg"

macOS/Linux:
  curl -L "https://raw.githubusercontent.com/ronvoy/CREA3/crea3.cc/_crea2-archive/crea-logo.jpeg" -o frontend/public/crea-logo.jpeg
