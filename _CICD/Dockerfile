# CREA3 CI/CD console — a standalone container (port 8088) with a small HTTP API
# and a single-page UI to pull/checkout branches, manage stashes and restart
# the platform (_CREA3x/run_be.sh) and the chatbot (_CREA3-Chatbot/run_chatbot.sh).
# It drives the HOST Docker daemon through the mounted socket, so everything it
# starts is a normal host container — exactly what the scripts start by hand.
FROM alpine:3.20
RUN apk add --no-cache bash git openssh-client docker-cli docker-cli-compose python3 curl coreutils procps
WORKDIR /cicd
COPY cicd.py /cicd/cicd.py
COPY ui /cicd/ui
ENV PYTHONUNBUFFERED=1
EXPOSE 8088
CMD ["python3", "/cicd/cicd.py"]
