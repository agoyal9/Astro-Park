CREATE TABLE Employee_Weather_Report(
    employee_id INT,
    record_date DATE,
    PRIMARY KEY(employee_id, record_date),
    FOREIGN KEY (employee_id) REFERENCES Employee(employee_id),
    FOREIGN KEY (record_date) REFERENCES Weather_Record(record_date)
)