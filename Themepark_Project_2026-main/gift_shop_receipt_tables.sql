IF OBJECT_ID('Gift_Shop_Receipt', 'U') IS NULL
BEGIN
  CREATE TABLE Gift_Shop_Receipt (
    receipt_id INT IDENTITY(1,1) PRIMARY KEY,
    customer_id INT NOT NULL,
    purchase_datetime DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
    FOREIGN KEY (customer_id) REFERENCES Customers(customer_id)
  );
END;
GO

IF OBJECT_ID('Gift_Shop_Receipt_Item', 'U') IS NULL
BEGIN
  CREATE TABLE Gift_Shop_Receipt_Item (
    receipt_item_id INT IDENTITY(1,1) PRIMARY KEY,
    receipt_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    FOREIGN KEY (receipt_id) REFERENCES Gift_Shop_Receipt(receipt_id),
    FOREIGN KEY (product_id) REFERENCES Gift_Shop(product_id)
  );
END;
GO
