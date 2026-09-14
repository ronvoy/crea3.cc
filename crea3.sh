#!/bin/bash

while true; do
    ssh -R crea3.serveousercontent.com:80:localhost:8000 serveo.net

    echo "SSH connection exited. Restarting..."
    sleep 2
done
