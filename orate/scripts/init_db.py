from orate.db.session import init_db, DB_PATH
init_db()
print("DB ready at:", DB_PATH)

# python -m orate.scripts.init_db
