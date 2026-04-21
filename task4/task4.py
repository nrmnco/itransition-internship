import pandas as pd
import yaml
import re
import os
import matplotlib.pyplot as plt
from datetime import datetime

base_data_path = "data/data"

# Find parent for user clusters
def find(parent, i):
    if parent[i] == i:
        return i
    parent[i] = find(parent, parent[i])
    return parent[i]

# Union two user clusters
def union(parent, i, j):
    root_i = find(parent, i)
    root_j = find(parent, j)
    if root_i != root_j:
        parent[root_i] = root_j

# Parse prices and convert currencies
def get_price(s):
    if pd.isna(s) or s == "": return 0.0
    s = str(s).upper().strip()
    is_eur = "€" in s or "EUR" in s
    if "¢" in s:
        nums = re.findall(r"\d+", s)
        val = float(nums[0]) + float(nums[1])/100.0 if len(nums) > 1 else float(nums[0])
    else:
        m = re.search(r"(\d+[\.,]?\d*)", s.replace(",", "."))
        val = float(m.group(1)) if m else 0.0
    return val * 1.2 if is_eur else val

# Robust date parsing for various formats
def fix_date(ts):
    if pd.isna(ts): return None
    s = str(ts).replace(";", " ").replace(",", " ")
    s = re.sub(r"([0-9])\s*(A\.M\.|P\.M\.|AM|PM)", r"\1 \2", s, flags=re.I).replace("A.M.", "AM").replace("P.M.", "PM")
    fmts = ["%d/%m/%y %I:%M:%S %p", "%H:%M %d-%b-%Y", "%H:%M:%S %Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%I:%M:%S %p %d-%B-%Y", "%d-%B-%Y %I:%M:%S %p"]
    for f in fmts:
        try: return datetime.strptime(s.strip(), f)
        except: continue
    return pd.to_datetime(s, errors='coerce')



for folder in ["DATA1", "DATA2", "DATA3"]:
    print(f"\n--- {folder} ---")
    path = os.path.join(base_data_path, folder)
    
    # Question 1 load data
    with open(os.path.join(path, "books.yaml"), "r") as f:
        books = pd.DataFrame(yaml.safe_load(f))
    orders = pd.read_parquet(os.path.join(path, "orders.parquet"))
    users = pd.read_csv(os.path.join(path, "users.csv"))

    # Clean data
    orders["unit_price"] = orders["unit_price"].apply(get_price)
    
    # Question 2 add paid_price
    orders["paid_price"] = orders["quantity"] * orders["unit_price"]
    # print(orders.head())

    # Question 3 extract date (year, month, day) from timestamp
    orders["dt"] = orders["timestamp"].apply(fix_date)
    orders["date_str"] = orders["dt"].dt.strftime("%Y-%m-%d")

    # print(folder)
    # print(orders.head())

    # Question 4 daily revenue and top 5 days
    rev = orders.groupby("date_str")["paid_price"].sum().sort_index()
    top5 = rev.sort_values(ascending=False).head(5)
    
    # Question 5 real unique users
    p = list(range(len(users)))
    seen = {"name": {}, "email": {}, "phone": {}, "address": {}}
    for i, row in users.iterrows():
        for col in seen:
            v = str(row[col]).strip().lower() if pd.notna(row[col]) else ""
            if v and v != "nan":
                if v in seen[col]: union(p, i, seen[col][v])
                else: seen[col][v] = i
    users["cluster"] = [find(p, i) for i in range(len(users))]
    
    # Question 6 unique sets of authors
    auth_col = ":author" if ":author" in books.columns else "author"
    books["auth_set"] = books[auth_col].apply(lambda x: tuple(sorted(x)) if isinstance(x, list) else (x,))
    
    # Question 7most popular author set
    merged = orders.merge(books, left_on="book_id", right_on=":id" if ":id" in books.columns else "id")
    popular = merged.groupby("auth_set")["quantity"].sum().sort_values(ascending=False)
    
    # Question 8 top customer by total spending
    cust_orders = orders.merge(users[["id", "cluster"]], left_on="user_id", right_on="id")
    spending = cust_orders.groupby("cluster")["paid_price"].sum().sort_values(ascending=False)
    best_cust_ids = users[users["cluster"] == spending.index[0]]["id"].tolist() if not spending.empty else []

    # Print results for dashboard
    print(f"Daily Revenue (Top 5):\n{top5}")
    print(f"Unique Users: {users['cluster'].nunique()}")
    print(f"Unique Author Sets: {books['auth_set'].nunique()}")
    print(f"Most Popular Author(s): {', '.join(popular.index[0]) if not popular.empty else 'N/A'}")
    print(f"Best Buyer IDs: {best_cust_ids}")

    # Question 9 Plot line chart
    plt.figure(figsize=(10, 5))
    rev.plot(kind="line", marker="o")
    plt.title(f"Revenue - {folder}")
    plt.savefig(f"revenue_{folder.lower()}.png")
    plt.close()

print("\nDone. Statistics printed and plots saved.")