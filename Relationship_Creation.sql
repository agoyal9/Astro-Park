DROP TABLE Ticket_Payment;

CREATE TABLE Ticket (
    ticket_id int PRIMARY KEY,
    customer_id INT NOT NULL FOREIGN KEY REFERENCES Customers(customer_id),
    ticket_type_id int NOT NULL FOREIGN KEY REFERENCES Ticket_Type(ticket_type_id),
    issue_date DATE,
    expiration_date DATE
);

CREATE TABLE Ticket_Payment (
    payment_id int PRIMARY KEY,
    customer_id int FOREIGN KEY REFERENCES Customers(customer_id),
    ticket_type_id int NOT NULL FOREIGN KEY REFERENCES Ticket_Type(ticket_type_id),
    price DECIMAL(10,2) CHECK (price > 0),
    purchase_date TIMESTAMP
);