# SmartExpenses AI — backend image
#
#   docker build -f backend/Dockerfile -t smartexpenses-api .
#   docker run -p 8001:8001 --env-file backend/.env smartexpenses-api
#
# The build context is the project root, because the API also needs the ml/
# folder and the trained model files.

FROM python:3.12-slim

# Keep the image small and the logs unbuffered.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8001

WORKDIR /app

# The requirements change less often than the code, so they are installed in
# their own layer.
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# The application code.
COPY backend /app/backend
COPY ml /app/ml

# The SQLite files are written into this folder. Mount a volume on it to keep
# the data when the container is replaced.
RUN mkdir -p /app/data
ENV EXPENSES_DB_PATH=/app/data/expenses.db \
    SIGNUP_DB_PATH=/app/data/signup.db

EXPOSE 8001

# Fail the container health check when the API stops answering.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health').read()" || exit 1

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8001"]
