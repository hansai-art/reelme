# Reelme on GMI Agentbox: the life cinema + an AI director backed by GMI MaaS
FROM --platform=linux/amd64 python:3.12-slim
WORKDIR /app
COPY server.py ./
COPY static ./static
ENV PORT=8080 PYTHONUNBUFFERED=1
EXPOSE 8080
USER nobody
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=4)"
CMD ["python", "server.py"]
