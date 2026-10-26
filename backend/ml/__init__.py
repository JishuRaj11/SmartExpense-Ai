"""Machine-learning helpers for SmartExpenses AI.

Three scripts live here:

    category_prediction.py   expense title -> category (TF-IDF + logistic regression)
    spending_prediction.py   next month spending for one user (linear regression)
    import_dataset.py        seed expenses.db with the practice dataset

Both prediction modules are also importable as part of the backend package:

    from backend.ml.category_prediction import predict_category
    from backend.ml.spending_prediction import predict_next_month_spending
"""
