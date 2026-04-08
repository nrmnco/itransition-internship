from fastapi import FastAPI
from math import lcm

app = FastAPI()

@app.get("/issayevnariman_gmail_com")
def get_lcm(x: str, y: str):
    if not x.isdigit() or not y.isdigit():
        return "NaN"

    x = int(x)
    y = int(y)

    if x < 0 or y < 0:
        return "NaN"

    return str(lcm(x, y))
        


