from orate.db.session import init_db, DB_PATH
init_db()
print("DB ready at:", DB_PATH)
