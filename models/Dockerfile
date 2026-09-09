# CineSense inference bridge
# CPU baseline. For GPU inference enable the NVIDIA Container Toolkit and
# uncomment the `deploy` block for the `models` service in docker-compose.yml,
# then install torch with the CUDA index inside requirements (or extend here).
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY inference_server.py ./

EXPOSE 8000
CMD ["uvicorn", "inference_server:app", "--host", "0.0.0.0", "--port", "8000"]
