CREATE TABLE Role(
    role_id INT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL
);

ALTER TABLE Employee DROP COLUMN role_id;

ALTER TABLE Employee ADD role_id INT FOREIGN KEY REFERENCES Role(role_id);