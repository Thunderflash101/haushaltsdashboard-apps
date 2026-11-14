FROM python:3.13-alpine
WORKDIR /app
RUN apk add --no-cache tzdata
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py calendar_search.py calendar_edit.py calendar_connection.py google_calendar.py meals.py weather.py shopping.py ingredients.py recipe_meta.py suggestions.py weekly.py family.py photos.py profiles.py reminders.py meal_ai.py meal_images.py meal_experience.py ./
COPY www ./www
COPY bridge ./bridge
CMD ["python3", "server.py"]
