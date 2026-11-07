FROM python:3.13-alpine
WORKDIR /app
RUN apk add --no-cache tzdata
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py meals.py weather.py shopping.py ingredients.py recipe_meta.py suggestions.py weekly.py family.py photos.py profiles.py reminders.py ./
COPY www ./www
CMD ["python3", "server.py"]
