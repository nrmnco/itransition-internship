import re
import json
import psycopg2

with open("task1_d.json", "r") as f:
    data = f.read()

fix = data
fix = re.sub(r":(\w+)", r'"\1"', fix)
fix = fix.replace("=>", ":")

data = json.loads(fix)

conn = psycopg2.connect(
    dbname="itransition",
    user="postgres",
    password="password",
    host="localhost",
    port="5432"
)

cur = conn.cursor()

cur.execute("""
    CREATE TABLE IF NOT EXISTS books (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255),
        author VARCHAR(255),
        genre VARCHAR(255),
        publisher VARCHAR(255),
        year INT,
        price VARCHAR(255)
    );
    """
)

conn.commit()


for book in data:
    cur.execute("""
        INSERT INTO books (id, title, author, genre, publisher, year, price)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (book["id"], book["title"], book["author"], book["genre"], book["publisher"], book["year"], book["price"]))

conn.commit()
cur.close()
conn.close()
        

