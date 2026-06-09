CREATE TABLE Product (
  ProductID INT IDENTITY(1,1) PRIMARY KEY,
  Name VARCHAR(50),
  Price DECIMAL(5,2),
  Stock INT
);

CREATE TABLE Orders (
  OrderID INT IDENTITY(1,1) PRIMARY KEY,
  CustomerID INT,
  OrderDate DATE
);

CREATE TABLE OrderItem (
  OrderID INT,
  ProductID INT,
  Quantity INT,
  PRIMARY KEY (OrderID, ProductID),
  FOREIGN KEY (OrderID) REFERENCES Orders(OrderID),
  FOREIGN KEY (ProductID) REFERENCES Product(ProductID)
);
GO

CREATE TRIGGER prevent_negative_stock
ON Product
INSTEAD OF UPDATE
AS
BEGIN
  IF EXISTS (
    SELECT 1
    FROM inserted
    WHERE Stock < 0
  )
  BEGIN
    RAISERROR ('Stock cannot be negative', 16, 1);
    RETURN;
  END

  UPDATE Product
  SET
    Name = inserted.Name,
    Price = inserted.Price,
    Stock = inserted.Stock
  FROM Product
  INNER JOIN inserted
    ON Product.ProductID = inserted.ProductID;
END;
GO
