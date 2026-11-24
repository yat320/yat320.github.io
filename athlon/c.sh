#!/bin/sh
# EN EL ATHLON (como tu usuario, sin sudo): instala gcloud y abre Google Cloud Shell por SSH.
# Primera vez:  sh cloudshell-athlon.sh   (instala, te da un link para el celu, conecta)
# Las siguientes: sh cloudshell-athlon.sh  (solo conecta)
SDK=$HOME/google-cloud-sdk
command -v ssh >/dev/null 2>&1 || sudo apt-get install -y openssh-client python3
if [ ! -x "$SDK/bin/gcloud" ]; then
  echo "== Bajando gcloud de 32 bits (unos 100 MB)..."
  cd "$HOME" || exit 1
  wget -O gcloud.tar.gz --timeout=60 \
    https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86.tar.gz \
    || { echo "No existe/no baja la versión de 32 bits de gcloud. Avisale a Claude."; exit 1; }
  tar -xzf gcloud.tar.gz && rm -f gcloud.tar.gz
  CLOUDSDK_PYTHON=python3 "$SDK/install.sh" --quiet --usage-reporting false --path-update true --command-completion false
fi
export CLOUDSDK_PYTHON=python3
G="$SDK/bin/gcloud"
"$G" --version >/dev/null 2>&1 || { echo "gcloud no arranca (¿Illegal instruction?). Avisale a Claude."; exit 1; }
if ! "$G" auth list --format='value(account)' 2>/dev/null | grep -q '@'; then
  echo "== Inicio de sesión: abrí en el CELU el link que aparece, entrá con tu Google y pegá acá el código."
  "$G" auth login --no-launch-browser </dev/tty || exit 1
fi
echo "== Conectando a Cloud Shell (la primera vez puede tardar un minuto)..."
"$G" cloud-shell ssh --authorize-session </dev/tty
