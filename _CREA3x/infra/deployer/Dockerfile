# Deployer sidecar: pulls the repo and rebuilds/restarts the platform and the
# chatbot on request from the admin panel (System → CI/CD). It talks to the
# HOST Docker daemon through the mounted socket, so the containers it starts
# are ordinary host containers — exactly what ./run_be.sh would start by hand.
FROM alpine:3.20
RUN apk add --no-cache bash git openssh-client docker-cli docker-cli-compose python3 curl coreutils
COPY deployer.py /deployer.py
ENV PYTHONUNBUFFERED=1
EXPOSE 9000
CMD ["python3", "/deployer.py"]
