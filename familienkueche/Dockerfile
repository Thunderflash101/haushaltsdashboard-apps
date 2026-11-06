FROM python:3.13-alpine
WORKDIR /app
RUN apk add --no-cache tzdata
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py meals.py weather.py shopping.py ./
COPY www ./www
CMD ["python3", "server.py"]
