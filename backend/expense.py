from fastapi import FastAPI
from pydantic import BaseModel

app=FastAPI(title="SmartExpenses API")

class Expense(BaseModel):
    title: str
    amount: float
    category: str
    date: int

@app.get("/")
def home():
    return{
        "Message":"Smartexpense backend is Running"
    }
@app.post("/expenses")
def Create_expenses(expense:Expense):
    return{
        "Message":"Expenses is created Succesfully ",
        "Expenses": expense
    }








