CREATE TABLE Customers (
    customer_id int PRIMARY KEY,
    first_name VARCHAR(30) CHECK (LEN(first_name) > 1),
    middle_initial CHAR(1),
    last_name VARCHAR(30) CHECK (LEN(last_name) > 1),
    date_of_birth DATE,
    phone_number CHAR(10) CHECK (LEN(phone_number) = 10),
    email_address VARCHAR(255) CHECK (LEN(email_address) > 0) UNIQUE
);

CREATE TABLE Ticket_Type(
    ticket_type_id INT PRIMARY KEY,
    ticket_type_name VARCHAR(50) NOT NULL
);

CREATE TABLE Ticket_Payment (
    payment_id int PRIMARY KEY,
    customer_id int FOREIGN KEY REFERENCES Customers(customer_id),
    ticket_type_id int NOT NULL FOREIGN KEY REFERENCES Ticket_Type(ticket_type_id),
    price DECIMAL(10,2) CHECK (price > 0),
    purchase_date TIMESTAMP
);

CREATE TABLE Ride (
    ride_id int PRIMARY KEY,
    ride_name VARCHAR(50),
    ride_price DECIMAL CHECK (ride_price > 0),
    ride_status INT
);

CREATE TABLE Employee (
    employee_id INT PRIMARY KEY,
    first_name VARCHAR(30) CHECK (LEN(first_name) > 1),
    middle_initial CHAR(1),
    last_name VARCHAR(30) CHECK (LEN(last_name) > 1),
    role_id INT,
    username VARCHAR(30) CHECK (LEN(username) > 6),
    employee_password VARCHAR(30) CHECK (LEN(employee_password) > 6),
    ssn CHAR(9),
    pay_rate DECIMAL CHECK (pay_rate > 0)
);

CREATE TABLE Maintenance_Ticket (
    maintenance_id int PRIMARY KEY,
    ride_id int FOREIGN KEY REFERENCES Ride(ride_id),
    employee_id int FOREIGN KEY REFERENCES Employee(employee_id),
    date_opened DATE,
    report TEXT,
    ride_status VARCHAR(30) NOT NULL CHECK (ride_status IN('operational', 'minor maintenance', 'major maintenance'))
);

CREATE TABLE Breakdown_Record (
    breakdown_id int PRIMARY KEY,
    ride_id int FOREIGN KEY REFERENCES Ride(ride_id),
    breakdown_timestamp TIMESTAMP,
    reason TEXT
);

CREATE TABLE Inspection_Record (
    inspection_id int PRIMARY KEY,
    ride_id int FOREIGN KEY REFERENCES Ride(ride_id),
    employee_id int FOREIGN KEY REFERENCES Employee(employee_id),
    inspection_date DATE,
    result TINYINT
);

CREATE TABLE Incident_Report(
    incident_id INT PRIMARY KEY,
    ride_id int FOREIGN KEY REFERENCES Ride(ride_id),
    customer_id int FOREIGN KEY REFERENCES Customers(customer_id),
    incident_date DATE,
    severity VARCHAR(30) NOT NULL CHECK (severity IN('Low', 'Medium', 'High', 'Critical')),
    incident_description TEXT
);

CREATE TABLE Gift_Shop(
    product_id INT PRIMARY KEY,
    product_name VARCHAR(50) NOT NULL,
    product_price DECIMAL CHECK (product_price > 0),
    stock INT DEFAULT 0
);

CREATE TABLE Sales_Transaction(
    transaction_id INT PRIMARY KEY,
    customer_id INT FOREIGN KEY REFERENCES Customers(customer_id),
    transaction_datetime DATETIME2,
    total_amount DECIMAL(10,2),
    payment_method VARCHAR(20) NOT NULL
        CHECK (payment_method IN ('Cash', 'Credit Card', 'Debit Card', 'Apple Pay'))
);

CREATE TABLE Weather_Record(
    record_date DATE PRIMARY KEY,
    condition VARCHAR(30) NOT NULL CHECK (condition IN('Sunny', 'Foggy', 'Light rain', 'Heavy rain', 'Heatwave', 'Snowing')),
    rainout_flag TINYINT
);



