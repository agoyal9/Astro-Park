require('dotenv').config();
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const sql = require("mssql");

const port = process.env.PORT || 4000;

const requiredDbEnv = ["DB_SERVER", "DB_NAME"];
const missingDbEnv = requiredDbEnv.filter((key) => !process.env[key]);

if (missingDbEnv.length > 0) {
  console.error(
    `Missing required database environment variables: ${missingDbEnv.join(", ")}`,
  );
  process.exit(1);
}

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    trustServerCertificate: true,
    trustedConnection: true,
  },
};

let connectionPromise = null;

async function ensureDbConnection() {
  if (!connectionPromise) {
    connectionPromise = sql.connect(config).catch((err) => {
      connectionPromise = null;
      throw err;
    });
  }

  return connectionPromise;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain" });
  res.end(text);
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, { "Content-Type": "text/html" });
  res.end(html);
}

function sendStatus(res, statusCode) {
  res.writeHead(statusCode);
  res.end();
}

function sendRedirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

async function serveStaticFile(req, res) {
  let urlPath = url.parse(req.url, true).pathname;

  if (urlPath === "/") {
    urlPath = "/login.html";
  }

  const cleanPath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, "");
  const filePath = path.join(__dirname, "docs", cleanPath);

  const docsPath = path.join(__dirname, "docs");
  if (!filePath.startsWith(docsPath)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stats = await fs.promises.stat(filePath);

    if (stats.isDirectory()) {
      const indexPath = path.join(filePath, "index.html");
      try {
        const indexStats = await fs.promises.stat(indexPath);
        if (indexStats.isFile()) {
          const content = await fs.promises.readFile(indexPath);
          res.writeHead(200, { "Content-Type": mimeTypes[".html"] });
          res.end(content);
          return;
        }
      } catch {}
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    if (stats.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || "application/octet-stream";
      const content = await fs.promises.readFile(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404);
      res.end("Not Found");
    } else {
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  }
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    const MAX_BODY_BYTES = 1024 * 1024;

    req.on("data", (chunk) => {
      body += chunk.toString();

      if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseUrlEncodedString(body) {
  const params = new URLSearchParams(body);
  const data = {};
  for (const [key, value] of params) {
    data[key] = value;
  }
  return data;
}

async function parseJsonBody(req) {
  const body = await readRawBody(req);
  const contentType = (req.headers["content-type"] || "").toLowerCase();

  if (!body) {
    return {};
  }

  const trimmed = body.trim();
  const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");

  if (contentType.includes("application/json") || looksLikeJson) {
    try {
      return JSON.parse(body);
    } catch (err) {
      if (contentType.includes("application/json")) {
        throw new Error("Invalid JSON");
      }
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return parseUrlEncodedString(body);
  }

  throw new Error("Invalid JSON");
}

async function parseFormBody(req) {
  const body = await readRawBody(req);
  const contentType = (req.headers["content-type"] || "").toLowerCase();

  if (!body) {
    return {};
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return parseUrlEncodedString(body);
  }

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(body);
    } catch (err) {
      throw new Error("Invalid form data");
    }
  }

  try {
    return parseUrlEncodedString(body);
  } catch (err) {
    throw new Error("Invalid form data");
  }
}

function parseUrl(req) {
  const parsedUrl = url.parse(req.url, true);
  return {
    pathname: parsedUrl.pathname,
    query: parsedUrl.query,
  };
}

function extractParams(pathname, pattern) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      const paramName = patternParts[i].substring(1);
      params[paramName] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }

  return params;
}

function checkRoles(req, res, allowedRoles) {
  const roleId = Number(req.headers["role_id"]);

  if (!roleId || !allowedRoles.includes(roleId)) {
    sendText(res, 403, "Access denied");
    return false;
  }

  return true;
}

function checkRolesMiddleware(req, allowedRoles) {
  const roleId = Number(req.headers["role_id"]);
  if (!roleId || !allowedRoles.includes(roleId)) {
    return false;
  }
  return true;
}

async function processCheckout(customerIdRaw, ticketCartRaw, giftCartRaw) {
  const customerId = Number.parseInt(customerIdRaw, 10);
  const ticketCart = Array.isArray(ticketCartRaw) ? ticketCartRaw : [];
  const giftCart = Array.isArray(giftCartRaw) ? giftCartRaw : [];

  if (!Number.isInteger(customerId) || customerId <= 0) {
    throw new Error("Customer ID must be valid.");
  }

  if (ticketCart.length === 0 && giftCart.length === 0) {
    throw new Error("No items in checkout cart.");
  }

  const checkRequest = new sql.Request();
  checkRequest.input("customer_id", sql.Int, customerId);

  const customerCheck = await checkRequest.query(
    "SELECT 1 FROM Customers WHERE customer_id = @customer_id AND is_active = 1",
  );

  if (customerCheck.recordset.length === 0) {
    throw new Error("Invalid customer ID.");
  }

  const transaction = new sql.Transaction();
  await transaction.begin();

  try {
    const purchasedAt = new Date();
    const expirationDate = new Date();
    expirationDate.setDate(purchasedAt.getDate() + 30);

    const receipt = {
      purchasedAt,
      ticketItems: [],
      giftItems: [],
      ticketSubtotal: 0,
      giftSubtotal: 0,
      grandTotal: 0,
      ticketPaymentId: null,
      giftReceiptId: null,
    };

    if (ticketCart.length > 0) {
      for (const item of ticketCart) {
        const rideId = Number.parseInt(item.ride_id, 10);
        const quantity = Number.parseInt(item.quantity, 10);
        const ticketType = item.ticket_type || "Adult";

        if (!Number.isInteger(rideId) || rideId <= 0) {
          throw new Error("Invalid ride ID in ticket cart.");
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
          throw new Error("Ticket quantity must be at least 1.");
        }

        const rideRequest = new sql.Request(transaction);
        rideRequest.input("ride_id", sql.Int, rideId);

        const rideResult = await rideRequest.query(`
          SELECT ride_name, ride_price
          FROM Ride
          WHERE ride_id = @ride_id
            AND (
              COL_LENGTH('dbo.Ride', 'deprecated') IS NULL
              OR ISNULL(deprecated, 0) = 0
            )
        `);

        if (rideResult.recordset.length === 0) {
          throw new Error("Invalid ride ID in ticket cart.");
        }

        const rideName = rideResult.recordset[0].ride_name;
        let ticketUnitPrice = Number.parseFloat(
          rideResult.recordset[0].ride_price,
        );

        if (String(ticketType).toLowerCase() === "child") {
          ticketUnitPrice *= 0.5;
        }

        receipt.ticketSubtotal += ticketUnitPrice * quantity;
        receipt.ticketItems.push({
          ride_id: rideId,
          ride_name: rideName,
          ticket_type: ticketType,
          quantity,
          unit_price: Number(ticketUnitPrice.toFixed(2)),
          line_total: Number((ticketUnitPrice * quantity).toFixed(2)),
        });
      }

      const paymentRequest = new sql.Request(transaction);
      paymentRequest.input("customer_id", sql.Int, customerId);
      paymentRequest.input("price", sql.Decimal(10, 2), receipt.ticketSubtotal);
      paymentRequest.input("purchase_date", sql.DateTime, purchasedAt);

      const paymentResult = await paymentRequest.query(`
        INSERT INTO Ticket_Payment (customer_id, price, purchase_date)
        OUTPUT INSERTED.payment_id
        VALUES (@customer_id, @price, @purchase_date)
      `);

      receipt.ticketPaymentId = paymentResult.recordset[0].payment_id;

      for (const item of receipt.ticketItems) {
        for (let i = 0; i < item.quantity; i++) {
          const ticketRequest = new sql.Request(transaction);
          ticketRequest.input("customer_id", sql.Int, customerId);
          ticketRequest.input("visit_date", sql.DateTime, purchasedAt);
          ticketRequest.input("exp_date", sql.DateTime, expirationDate);
          ticketRequest.input("ride", sql.Int, item.ride_id);
          ticketRequest.input("ticket_type", sql.VarChar(20), item.ticket_type);
          ticketRequest.input(
            "ticket_price",
            sql.Decimal(10, 2),
            item.unit_price,
          );

          await ticketRequest.query(`
            INSERT INTO Ticket (
              customer_id,
              visiting_date,
              expiration_date,
              ride,
              ticket_type,
              ticket_price
            )
            VALUES (
              @customer_id,
              @visit_date,
              @exp_date,
              @ride,
              @ticket_type,
              @ticket_price
            )
          `);
        }
      }
    }

    if (giftCart.length > 0) {
      for (const item of giftCart) {
        const productId = Number.parseInt(item.product_id, 10);
        const quantity = Number.parseInt(item.quantity, 10);

        if (!Number.isInteger(productId) || productId <= 0) {
          throw new Error("Invalid product ID in gift cart.");
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
          throw new Error("Gift item quantity must be at least 1.");
        }

        const productRequest = new sql.Request(transaction);
        productRequest.input("product_id", sql.Int, productId);

        const productResult = await productRequest.query(`
          SELECT product_name, product_price, stock
          FROM Gift_Shop WITH (UPDLOCK, ROWLOCK)
          WHERE product_id = @product_id
        `);

        if (productResult.recordset.length === 0) {
          throw new Error("Invalid product in gift cart.");
        }

        const product = productResult.recordset[0];
        if (product.stock < quantity) {
          throw new Error(
            `${product.product_name} only has ${product.stock} item(s) left in stock.`,
          );
        }

        const unitPrice = Number.parseFloat(product.product_price);
        const lineTotal = unitPrice * quantity;
        receipt.giftSubtotal += lineTotal;
        receipt.giftItems.push({
          product_id: productId,
          product_name: product.product_name,
          quantity,
          unit_price: Number(unitPrice.toFixed(2)),
          line_total: Number(lineTotal.toFixed(2)),
        });

        const updateStockRequest = new sql.Request(transaction);
        updateStockRequest.input("product_id", sql.Int, productId);
        updateStockRequest.input("quantity", sql.Int, quantity);

        await updateStockRequest.query(`
          UPDATE Gift_Shop
          SET stock = stock - @quantity
          WHERE product_id = @product_id
        `);
      }

      const receiptTableCheck = new sql.Request(transaction);
      const tableCheckResult = await receiptTableCheck.query(`
        SELECT
          OBJECT_ID('Gift_Shop_Receipt', 'U') AS receipt_table_id,
          OBJECT_ID('Gift_Shop_Receipt_Item', 'U') AS receipt_item_table_id
      `);

      const hasReceiptTables =
        tableCheckResult.recordset[0].receipt_table_id &&
        tableCheckResult.recordset[0].receipt_item_table_id;

      if (hasReceiptTables) {
        const giftReceiptRequest = new sql.Request(transaction);
        giftReceiptRequest.input("customer_id", sql.Int, customerId);
        giftReceiptRequest.input(
          "purchase_datetime",
          sql.DateTime2,
          purchasedAt,
        );
        giftReceiptRequest.input(
          "subtotal",
          sql.Decimal(10, 2),
          receipt.giftSubtotal,
        );

        const giftReceiptResult = await giftReceiptRequest.query(`
          INSERT INTO Gift_Shop_Receipt (customer_id, purchase_datetime, subtotal)
          OUTPUT INSERTED.receipt_id
          VALUES (@customer_id, @purchase_datetime, @subtotal)
        `);

        const giftReceiptId = giftReceiptResult.recordset[0].receipt_id;
        receipt.giftReceiptId = giftReceiptId;

        for (const giftItem of receipt.giftItems) {
          const giftItemRequest = new sql.Request(transaction);
          giftItemRequest.input("receipt_id", sql.Int, giftReceiptId);
          giftItemRequest.input("product_id", sql.Int, giftItem.product_id);
          giftItemRequest.input("quantity", sql.Int, giftItem.quantity);
          giftItemRequest.input(
            "unit_price",
            sql.Decimal(10, 2),
            giftItem.unit_price,
          );

          await giftItemRequest.query(`
            INSERT INTO Gift_Shop_Receipt_Item
              (receipt_id, product_id, quantity, unit_price)
            VALUES
              (@receipt_id, @product_id, @quantity, @unit_price)
          `);
        }
      }
    }

    receipt.ticketSubtotal = Number(receipt.ticketSubtotal.toFixed(2));
    receipt.giftSubtotal = Number(receipt.giftSubtotal.toFixed(2));
    receipt.grandTotal = Number(
      (receipt.ticketSubtotal + receipt.giftSubtotal).toFixed(2),
    );

    await transaction.commit();
    return receipt;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function handleRequest(req, res) {
  const { pathname, query } = parseUrl(req);

  try {
    if (req.method === "GET" && pathname === "/employees/inactive") {
      if (!checkRolesMiddleware(req, [1])) {
        sendText(res, 403, "Access denied");
        return;
      }
      await ensureDbConnection();
      const result = await sql.query(`
        SELECT e.employee_id, e.first_name, e.last_name, r.role_name
        FROM Employee e
        LEFT JOIN Role r ON e.role_id=r.role_id
        WHERE e.is_active = 0
        ORDER BY e.employee_id
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/employees") {
      if (!checkRolesMiddleware(req, [1])) {
        sendText(res, 403, "Access denied");
        return;
      }
      const status = query.status;
      await ensureDbConnection();
      let queryStr = `
        SELECT e.employee_id, e.first_name, e.middle_initial, e.last_name, e.role_id, r.role_name, e.username, e.pay_rate, e.is_active
        FROM Employee e
        LEFT JOIN Role r ON e.role_id=r.role_id
      `;
      if (status === "active") {
        queryStr += " WHERE e.is_active = 1";
      } else if (status === "inactive") {
        queryStr += " WHERE e.is_active = 0";
      }
      queryStr += " ORDER BY e.employee_id";
      const result = await sql.query(queryStr);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/rides/all") {
      if (!checkRolesMiddleware(req, [1, 2])) {
        sendText(res, 403, "Access denied");
        return;
      }
      await ensureDbConnection();
      const result = await sql.query(`
        SELECT
          ride_id,
          ride_name,
          ride_price,
          ride_status,
          CASE
            WHEN COL_LENGTH('dbo.Ride', 'deprecated') IS NULL THEN 0
            ELSE ISNULL(deprecated, 0)
          END AS deprecated
        FROM Ride
        ORDER BY ride_id
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/rides") {
      await ensureDbConnection();
      const result = await sql.query(`
        SELECT
          ride_id,
          ride_name,
          ride_price,
          ride_status,
          CASE
            WHEN COL_LENGTH('dbo.Ride', 'deprecated') IS NULL THEN 0
            ELSE ISNULL(deprecated, 0)
          END AS deprecated
        FROM Ride
        WHERE
          COL_LENGTH('dbo.Ride', 'deprecated') IS NULL
          OR ISNULL(deprecated, 0) = 0
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    const myTicketsParams = extractParams(pathname, "/my-tickets/:customer_id");
    if (req.method === "GET" && myTicketsParams) {
      const customerId = parseInt(myTicketsParams.customer_id, 10);
      if (!customerId) {
        sendText(res, 400, "Invalid customer ID.");
        return;
      }
      await ensureDbConnection();
      const request = new sql.Request();
      request.input("customer_id", sql.Int, customerId);
      const result = await request.query(`
        SELECT
          t.ticket_id,
          t.customer_id,
          t.visiting_date,
          t.expiration_date,
          t.ride,
          t.ticket_type,
          t.ticket_price,
          r.ride_name,
          r.ride_price
        FROM Ticket t
        LEFT JOIN Ride r ON t.ride = r.ride_id
        WHERE t.customer_id = @customer_id
        ORDER BY t.visiting_date DESC, t.ticket_id DESC
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    const maintenanceTicketParams = extractParams(
      pathname,
      "/maintenance-tickets/:ticket_id",
    );
    if (req.method === "GET" && maintenanceTicketParams) {
      const ticketId = maintenanceTicketParams.ticket_id;
      await ensureDbConnection();
      const request = new sql.Request();
      request.input("ticket_id", sql.Int, ticketId);
      const result = await request.query(`
        SELECT ticket_id, ride_id, employee_id, date_opened, issue_type, maintenance_description, maintenance_priority, maintenance_status
        FROM Maintenance_Ticket
        WHERE ticket_id = @ticket_id
      `);
      if (result.recordset.length === 0) {
        sendText(res, 404, "Ticket not found");
        return;
      }
      sendJson(res, 200, result.recordset[0]);
      return;
    }

    if (req.method === "GET" && pathname === "/maintenance-tickets") {
      await ensureDbConnection();
      const result = await sql.query(`
        SELECT
          mt.ticket_id,
          mt.ride_id,
          r.ride_name,
          mt.employee_id,
          mt.date_opened,
          mt.issue_type,
          mt.maintenance_description,
          mt.maintenance_priority,
          mt.maintenance_status
        FROM Maintenance_Ticket mt
        LEFT JOIN Ride r ON mt.ride_id = r.ride_id
        ORDER BY mt.date_opened DESC, mt.ticket_id DESC
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/gift-shop/alerts") {
      if (!checkRolesMiddleware(req, [1, 3])) {
        sendText(res, 403, "Access denied");
        return;
      }
      await ensureDbConnection();
      const tableCheck = await new sql.Request().query(`
        SELECT CASE
          WHEN OBJECT_ID('dbo.Gift_Shop_Low_Stock_Alert', 'U') IS NULL THEN 0
          ELSE 1
        END AS has_table
      `);
      if (!tableCheck.recordset[0]?.has_table) {
        sendJson(res, 200, []);
        return;
      }
      const result = await sql.query(`
        SELECT
          a.alert_id,
          a.product_id,
          a.product_name,
          a.current_stock,
          a.threshold,
          a.message,
          a.created_at
        FROM Gift_Shop_Low_Stock_Alert a
        WHERE a.acknowledged_at IS NULL
        ORDER BY a.created_at DESC, a.alert_id DESC
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/gift-shop/catalog") {
      await ensureDbConnection();
      const result = await sql.query(`
        SELECT product_id, product_name, product_price, stock
        FROM Gift_Shop
        WHERE stock > 0
        ORDER BY product_name
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/gift-shop/products") {
      if (!checkRolesMiddleware(req, [1, 3])) {
        sendText(res, 403, "Access denied");
        return;
      }
      await ensureDbConnection();
      const result = await sql.query(`
        SELECT product_id, product_name, product_price, stock
        FROM Gift_Shop
        ORDER BY product_name
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/complaints") {
      await ensureDbConnection();
      const result = await sql.query(`
        SELECT
          first_name,
          last_name,
          email,
          complaint_type,
          reason_if_other,
          complaint_description,
          incident_date
        FROM Complaint
        ORDER BY incident_date DESC
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/weather") {
      await ensureDbConnection();
      const result = await sql.query(`
        SELECT record_date, condition, rainout_flag
        FROM Weather_Record
        ORDER BY record_date DESC
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/stats/top-ride") {
      const { from, to } = query;
      if (!from || !to) {
        sendText(res, 400, "Please provide from and to dates.");
        return;
      }
      await ensureDbConnection();
      const request = new sql.Request();
      request.input("from", sql.Date, from);
      request.input("to", sql.Date, to);
      const result = await request.query(`
        SELECT
          r.ride_name AS Ride,
          r.ride_status AS Status,
          COUNT(t.ticket_id) AS Total_Tickets,
          ISNULL(SUM(t.ticket_price), 0) AS Total_Revenue,
          COUNT(DISTINCT mt.ride_id) AS Maintenance_Issues,
          ISNULL(MAX(mt.maintenance_priority), 'None') AS Highest_Priority
        FROM Ride r
        LEFT JOIN Ticket t ON r.ride_id = t.ride
          AND t.visiting_date BETWEEN @from AND @to
        LEFT JOIN Maintenance_Ticket mt ON r.ride_id = mt.ride_id
          AND mt.date_opened BETWEEN @from AND @to
        GROUP BY r.ride_id, r.ride_name, r.ride_status
        ORDER BY Total_Tickets DESC
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/stats/new-customers") {
      const { from, to } = query;
      if (!from || !to) {
        sendText(res, 400, "Please provide from and to dates.");
        return;
      }
      await ensureDbConnection();
      const request = new sql.Request();
      request.input("from", sql.Date, from);
      request.input("to", sql.Date, to);
      const result = await request.query(`
        SELECT
          c.customer_id AS ID,
          c.first_name + ' ' + c.last_name AS Customer_Name,
          COUNT(DISTINCT t.ticket_id) AS Tickets_Purchased,
          ISNULL(SUM(t.ticket_price), 0) AS Amount_Spent,
          MAX(t.visiting_date) AS Last_Visit,
          COUNT(DISTINCT gs_r.receipt_id) AS Gift_Shop_Visits
        FROM Customers c
        LEFT JOIN Ticket t ON c.customer_id = t.customer_id
          AND t.visiting_date BETWEEN @from AND @to
        LEFT JOIN Gift_Shop_Receipt gs_r ON c.customer_id = gs_r.customer_id
          AND CAST(gs_r.purchase_datetime AS DATE) BETWEEN @from AND @to
        WHERE c.is_active = 1
          AND (t.ticket_id IS NOT NULL OR gs_r.receipt_id IS NOT NULL)
        GROUP BY c.customer_id, c.first_name, c.last_name
        ORDER BY Amount_Spent DESC
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/stats/tickets") {
      const { from, to } = query;
      if (!from || !to) {
        sendText(res, 400, "Please provide from and to dates.");
        return;
      }
      await ensureDbConnection();
      const request = new sql.Request();
      request.input("from", sql.Date, from);
      request.input("to", sql.Date, to);
      const result = await request.query(`
        SELECT
          r.ride_name AS Ride,
          t.ticket_type AS Ticket_Type,
          COUNT(t.ticket_id) AS Tickets_Sold,
          SUM(t.ticket_price) AS Revenue,
          AVG(t.ticket_price) AS Avg_Price
        FROM Ticket t
        JOIN Ride r ON t.ride = r.ride_id
        WHERE t.visiting_date BETWEEN @from AND @to
        GROUP BY r.ride_name, t.ticket_type
        ORDER BY Tickets_Sold DESC
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/stats/revenue") {
      const { from, to } = query;
      if (!from || !to) {
        sendText(res, 400, "Please provide from and to dates.");
        return;
      }
      await ensureDbConnection();
      const request = new sql.Request();
      request.input("from", sql.Date, from);
      request.input("to", sql.Date, to);
      const result = await request.query(`
        WITH ticket_monthly AS (
          SELECT
            DATEFROMPARTS(YEAR(t.visiting_date), MONTH(t.visiting_date), 1) AS month_start,
            COUNT(t.ticket_id) AS Tickets_Sold,
            SUM(t.ticket_price) AS Ticket_Revenue
          FROM Ticket t
          WHERE t.visiting_date BETWEEN @from AND @to
          GROUP BY YEAR(t.visiting_date), MONTH(t.visiting_date)
        ),
        gift_monthly AS (
          SELECT
            DATEFROMPARTS(YEAR(gs_r.purchase_datetime), MONTH(gs_r.purchase_datetime), 1) AS month_start,
            COUNT(gs_r.receipt_id) AS Gift_Transactions,
            SUM(gs_r.subtotal) AS Gift_Revenue
          FROM Gift_Shop_Receipt gs_r
          WHERE CAST(gs_r.purchase_datetime AS DATE) BETWEEN @from AND @to
          GROUP BY YEAR(gs_r.purchase_datetime), MONTH(gs_r.purchase_datetime)
        )
        SELECT
          DATENAME(MONTH, tm.month_start) AS Month,
          tm.Tickets_Sold,
          tm.Ticket_Revenue,
          ISNULL(gm.Gift_Transactions, 0) AS Gift_Transactions,
          ISNULL(gm.Gift_Revenue, 0) AS Gift_Revenue,
          tm.Ticket_Revenue + ISNULL(gm.Gift_Revenue, 0) AS Total_Revenue
        FROM ticket_monthly tm
        LEFT JOIN gift_monthly gm ON gm.month_start = tm.month_start
        ORDER BY tm.month_start
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "GET" && pathname === "/customers") {
      const activeOnly = query.activeOnly === "1";
      await ensureDbConnection();
      const request = new sql.Request();
      request.input("active_only", sql.Bit, activeOnly ? 1 : 0);
      const result = await request.query(`
        SELECT 
          c.customer_id,
          c.first_name,
          c.middle_initial,
          c.last_name,
          c.date_of_birth,
          c.phone_number,
          c.email_address,
          c.is_active,
          MAX(t.visiting_date) AS last_visit_date
        FROM Customers c
        LEFT JOIN Ticket t on c.customer_id = t.customer_id
        WHERE (@active_only = 0 OR c.is_active = 1)
        GROUP BY
          c.customer_id,
          c.first_name,
          c.middle_initial,
          c.last_name,
          c.date_of_birth,
          c.phone_number,
          c.email_address,
          c.is_active
        ORDER BY last_visit_date DESC
      `);
      sendJson(res, 200, result.recordset);
      return;
    }

    if (req.method === "POST" && pathname === "/submit-maintenance") {
      const body = await parseFormBody(req);
      const employeeId = body.employee_id;
      const rideId = body.ride;
      const issueType = body["maintenance-type"];
      const priority = body.priority;
      const status = body.status;
      const dateOpened = body["date-opened"];
      const description = body.description;

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("employee_id", sql.Int, employeeId);
      request.input("ride_id", sql.Int, rideId);
      request.input("issue_type", sql.VarChar(50), issueType);
      request.input("maintenance_priority", sql.VarChar(20), priority);
      request.input("maintenance_status", sql.VarChar(20), status);
      request.input("date_opened", sql.DateTime, dateOpened);
      request.input(
        "maintenance_description",
        sql.VarChar(sql.MAX),
        description,
      );

      await request.query(`
        INSERT INTO Maintenance_Ticket
        (
          ride_id,
          employee_id,
          date_opened,
          issue_type,
          maintenance_description,
          maintenance_priority,
          maintenance_status
        )
        VALUES
        (
          @ride_id,
          @employee_id,
          @date_opened,
          @issue_type,
          @maintenance_description,
          @maintenance_priority,
          @maintenance_status
        )
      `);

      sendRedirect(res, "/maintenance_portal.html");
      return;
    }

    if (req.method === "POST" && pathname === "/submit-complaint") {
      const body = await parseFormBody(req);
      const fname = body.fname;
      const lname = body.lname;
      const email = body.email;
      const reason = body.reason;
      const description = body.description;
      const date = body.date;
      const otherReason = body["other-reason"];

      if (!fname || !lname || !email || !reason || !description || !date) {
        sendText(res, 400, "Missing required fields.");
        return;
      }

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("first_name", sql.VarChar(30), fname);
      request.input("last_name", sql.VarChar(30), lname);
      request.input("email", sql.VarChar(100), email);
      request.input("complaint_type", sql.VarChar(50), reason);
      request.input("reason_if_other", sql.VarChar(255), otherReason || null);
      request.input("complaint_description", sql.VarChar(sql.MAX), description);
      request.input("incident_date", sql.Date, date);

      await request.query(`
        INSERT INTO Complaint
        (first_name, last_name, email, complaint_type, reason_if_other, complaint_description, incident_date)
        VALUES
        (@first_name, @last_name, @email, @complaint_type, @reason_if_other, @complaint_description, @incident_date)
      `);

      sendRedirect(res, "/customer.html");
      return;
    }

    if (req.method === "POST" && pathname === "/buy-ticket") {
      const body = await parseJsonBody(req);
      const { customer_id, cart } = body;
      await ensureDbConnection();
      await processCheckout(customer_id, cart, []);
      sendText(res, 200, "Tickets purchased successfully!");
      return;
    }

    if (req.method === "POST" && pathname === "/checkout") {
      const body = await parseJsonBody(req);
      const { customer_id, ticket_cart, gift_cart } = body;
      await ensureDbConnection();
      const receipt = await processCheckout(
        customer_id,
        ticket_cart,
        gift_cart,
      );
      sendJson(res, 200, {
        success: true,
        message: "Checkout completed successfully.",
        receipt,
      });
      return;
    }

    if (req.method === "POST" && pathname === "/weather") {
      const body = await parseJsonBody(req);
      const { record_date, condition, rainout_flag } = body;
      if (!record_date || !condition) {
        sendText(res, 400, "record_date and condition are required.");
        return;
      }
      await ensureDbConnection();
      const request = new sql.Request();
      request.input("record_date", sql.Date, record_date);
      request.input("condition", sql.VarChar(30), condition);
      request.input("rainout_flag", sql.TinyInt, rainout_flag ?? 0);
      try {
        await request.query(`
          INSERT INTO Weather_Record (record_date, condition, rainout_flag)
          VALUES (@record_date, @condition, @rainout_flag)
        `);
        sendStatus(res, 200);
      } catch (err) {
        if (err.number === 2627 || err.number === 2601) {
          sendText(
            res,
            409,
            "Weather report for this date has already been submitted",
          );
        } else {
          throw err;
        }
      }
      return;
    }

    if (req.method === "POST" && pathname === "/create_customer_account") {
      const body = await parseJsonBody(req);
      const {
        first_name,
        middle_initial,
        last_name,
        date_of_birth,
        phone_number,
        email_address,
        password,
        retype_password,
      } = body;

      if (
        !first_name ||
        !last_name ||
        !date_of_birth ||
        !phone_number ||
        !email_address ||
        !password ||
        !retype_password
      ) {
        sendJson(res, 400, {
          success: false,
          message: "All required fields must be filled.",
        });
        return;
      }

      if (password !== retype_password) {
        sendJson(res, 400, {
          success: false,
          message: "Passwords do not match.",
        });
        return;
      }

      const normalizedPhone = String(phone_number).replace(/\D/g, "");
      if (normalizedPhone.length !== 10) {
        sendJson(res, 400, {
          success: false,
          message: "Phone number must be exactly 10 digits.",
        });
        return;
      }

      const trimmedMiddleInitial = (middle_initial || "").trim();
      if (trimmedMiddleInitial.length > 1) {
        sendJson(res, 400, {
          success: false,
          message: "Middle initial must be 1 character or blank.",
        });
        return;
      }

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("first_name", sql.VarChar(30), first_name.trim());
      request.input(
        "middle_initial",
        sql.Char(1),
        trimmedMiddleInitial ? trimmedMiddleInitial.toUpperCase() : null,
      );
      request.input("last_name", sql.VarChar(30), last_name.trim());
      request.input("date_of_birth", sql.Date, date_of_birth);
      request.input("phone_number", sql.Char(10), normalizedPhone);
      request.input("email_address", sql.VarChar(255), email_address.trim());
      request.input("customer_password", sql.VarChar(30), password);

      try {
        await request.query(`
          INSERT INTO Customers
          (first_name, middle_initial, last_name, date_of_birth, phone_number, email_address, customer_password, is_active)
          VALUES
          (@first_name, @middle_initial, @last_name, @date_of_birth, @phone_number, @email_address, @customer_password, 1)
        `);

        sendJson(res, 200, {
          success: true,
          redirect: "/customer_login.html",
          message: "Account created successfully.",
        });
      } catch (err) {
        if (err.number === 2627 || err.number === 2601) {
          sendJson(res, 409, {
            success: false,
            message: "An account with that email already exists.",
          });
        } else {
          sendJson(res, 500, {
            success: false,
            message: "Database error while creating account.",
          });
        }
      }
      return;
    }

    if (req.method === "POST" && pathname === "/customer_login") {
      const body = await parseJsonBody(req);
      const { username, password } = body;

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("input_username", sql.VarChar(30), username);
      request.input("input_password", sql.VarChar(30), password);

      const result = await request.query(`
        SELECT Customers.email_address, Customers.customer_id, Customers.first_name, Customers.last_name
        FROM Customers 
        WHERE Customers.email_address = @input_username
          AND Customers.customer_password = @input_password
          AND Customers.is_active = 1
      `);

      if (result.recordset.length === 0) {
        sendJson(res, 200, {
          success: false,
          redirect: "/customer_login.html",
        });
      } else {
        sendJson(res, 200, {
          success: true,
          redirect: "/customer.html",
          customer_id: result.recordset[0].customer_id,
          username: result.recordset[0].email_address,
          first_name: result.recordset[0].first_name,
          last_name: result.recordset[0].last_name,
          email_address: result.recordset[0].email_address,
        });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/employee_login") {
      const body = await parseJsonBody(req);
      const { username, password } = body;

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("input_username", sql.VarChar(30), username);
      request.input("input_password", sql.VarChar(30), password);

      const result = await request.query(`
        SELECT Employee.username, Employee.employee_id, Employee.role_id, Role.role_name
        FROM Employee 
        LEFT JOIN Role ON Employee.role_id = Role.role_id
        WHERE Employee.username = @input_username
          AND Employee.employee_password = @input_password
          AND Employee.is_active = 1
      `);

      if (result.recordset.length === 0) {
        sendJson(res, 200, {
          success: false,
          redirect: "/employee_login.html",
        });
      } else {
        sendJson(res, 200, {
          success: true,
          redirect: "/employee.html",
          username: result.recordset[0].username,
          employee_id: result.recordset[0].employee_id,
          role_id: result.recordset[0].role_id,
          role_name: result.recordset[0].role_name,
        });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/login") {
      const body = await parseJsonBody(req);
      const role = body.role;

      if (role === "customer") {
        sendJson(res, 200, { redirect: "/customer_login.html" });
      } else if (role === "employee") {
        sendJson(res, 200, { redirect: "/employee_login.html" });
      } else {
        sendText(res, 400, "Invalid role");
      }
      return;
    }

    if (req.method === "POST" && pathname === "/employees") {
      if (!checkRolesMiddleware(req, [1])) {
        sendText(res, 403, "Access denied");
        return;
      }
      const body = await parseJsonBody(req);
      const {
        first_name,
        last_name,
        middle_initial,
        username,
        password,
        ssn,
        pay_rate,
        role_id,
      } = body;

      if (
        !first_name ||
        !last_name ||
        !username ||
        !password ||
        !ssn ||
        !pay_rate
      ) {
        sendText(res, 400, "All required fields must be filled in.");
        return;
      }

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("first_name", sql.VarChar(30), first_name);
      request.input("last_name", sql.VarChar(30), last_name);
      request.input("middle_initial", sql.VarChar(1), middle_initial || null);
      request.input("username", sql.VarChar(30), username);
      request.input("password", sql.VarChar(30), password);
      request.input("ssn", sql.VarChar(9), ssn);
      request.input("pay_rate", sql.Decimal(10, 2), pay_rate);
      request.input("role_id", sql.Int, role_id || null);

      await request.query(`
        INSERT INTO Employee (first_name, middle_initial, last_name, username, employee_password, ssn, pay_rate, role_id, is_active)
        VALUES (@first_name, @middle_initial, @last_name, @username, @password, @ssn, @pay_rate, @role_id, 1)
      `);

      sendStatus(res, 200);
      return;
    }

    if (req.method === "POST" && pathname === "/rides") {
      if (!checkRolesMiddleware(req, [1, 2])) {
        sendText(res, 403, "Access denied");
        return;
      }
      const body = await parseJsonBody(req);
      const { ride_name, ride_price, ride_status } = body;

      if (!ride_name || ride_price == null || ride_status == null) {
        sendText(res, 400, "All required fields must be filled in.");
        return;
      }

      const parsedPrice = Number(ride_price);
      const parsedStatus = Number(ride_status);

      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        sendText(res, 400, "Ride price must be greater than 0.");
        return;
      }

      if (![0, 1].includes(parsedStatus)) {
        sendText(res, 400, "Ride status must be 0 (active) or 1 (closed).");
        return;
      }

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("ride_name", sql.VarChar(50), ride_name.trim());
      request.input("ride_price", sql.Decimal(10, 2), parsedPrice);
      request.input("ride_status", sql.Int, parsedStatus);

      await request.query(`
        INSERT INTO Ride (ride_name, ride_price, ride_status)
        VALUES (@ride_name, @ride_price, @ride_status)
      `);

      sendStatus(res, 200);
      return;
    }

    if (req.method === "POST" && pathname === "/gift-shop/products") {
      if (!checkRolesMiddleware(req, [1, 3])) {
        sendText(res, 403, "Access denied");
        return;
      }
      const body = await parseJsonBody(req);
      const { product_name, product_price, stock } = body;

      if (!product_name || product_price == null || stock == null) {
        sendJson(res, 400, {
          message: "Missing required product fields.",
        });
        return;
      }

      const parsedPrice = Number(product_price);
      const parsedStock = Number(stock);

      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        sendJson(res, 400, {
          message: "Product price must be greater than 0.",
        });
        return;
      }

      if (!Number.isInteger(parsedStock) || parsedStock < 0) {
        sendJson(res, 400, {
          message: "Stock must be a non-negative integer.",
        });
        return;
      }

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("product_name", sql.VarChar(100), product_name.trim());
      request.input("product_price", sql.Decimal(10, 2), parsedPrice);
      request.input("stock", sql.Int, parsedStock);

      await request.query(`
        INSERT INTO Gift_Shop (product_name, product_price, stock)
        VALUES (@product_name, @product_price, @stock)
      `);

      sendJson(res, 200, {
        success: true,
        message: "Product added successfully.",
      });
      return;
    }

    const employeeReactivateParams = extractParams(
      pathname,
      "/employees/reactivate/:id",
    );
    if (req.method === "PUT" && employeeReactivateParams) {
      if (!checkRolesMiddleware(req, [1])) {
        sendText(res, 403, "Access denied");
        return;
      }
      const id = employeeReactivateParams.id;
      await ensureDbConnection();
      const request = new sql.Request();
      request.input("id", sql.Int, id);
      await request.query(`
        UPDATE Employee
        SET is_active = 1
        WHERE employee_id = @id
      `);
      sendStatus(res, 200);
      return;
    }

    const employeeDeactivateParams = extractParams(
      pathname,
      "/employees/deactivate/:id",
    );
    if (req.method === "PUT" && employeeDeactivateParams) {
      if (!checkRolesMiddleware(req, [1])) {
        sendText(res, 403, "Access denied");
        return;
      }
      const id = employeeDeactivateParams.id;
      await ensureDbConnection();
      const request = new sql.Request();
      request.input("id", sql.Int, id);
      await request.query(`
        UPDATE Employee
        SET is_active = 0
        WHERE employee_id = @id
      `);
      sendStatus(res, 200);
      return;
    }

    const employeeParams = extractParams(pathname, "/employees/:id");
    if (req.method === "PUT" && employeeParams) {
      if (!checkRolesMiddleware(req, [1])) {
        sendText(res, 403, "Access denied");
        return;
      }
      const body = await parseJsonBody(req);
      const { role_id, username, pay_rate, first_name, last_name } = body;
      const id = employeeParams.id;

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("id", sql.Int, id);
      request.input(
        "role_id",
        sql.Int,
        role_id != null && role_id !== "" ? parseInt(role_id) : null,
      );
      request.input("username", sql.VarChar(30), username);
      request.input("pay_rate", sql.Decimal(10, 2), pay_rate);
      request.input("first_name", sql.VarChar(30), first_name);
      request.input("last_name", sql.VarChar(30), last_name);

      await request.query(`
        UPDATE Employee
        SET role_id = @role_id, username = @username, pay_rate = @pay_rate, first_name = @first_name, last_name = @last_name
        WHERE employee_id = @id
      `);
      sendStatus(res, 200);
      return;
    }

    const rideDeprecatedParams = extractParams(
      pathname,
      "/rides/:id/deprecated",
    );
    if (req.method === "PUT" && rideDeprecatedParams) {
      if (!checkRolesMiddleware(req, [1, 2])) {
        sendText(res, 403, "Access denied");
        return;
      }
      const body = await parseJsonBody(req);
      const rideId = Number(rideDeprecatedParams.id);
      const deprecated = Number(body.deprecated);

      if (!Number.isInteger(rideId) || rideId <= 0) {
        sendText(res, 400, "Invalid ride id.");
        return;
      }

      if (![0, 1].includes(deprecated)) {
        sendText(res, 400, "Deprecated must be 0 or 1.");
        return;
      }

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("ride_id", sql.Int, rideId);
      request.input("deprecated", sql.Int, deprecated);

      const result = await request.query(`
        UPDATE Ride
        SET deprecated = @deprecated
        WHERE ride_id = @ride_id
      `);

      if (!result.rowsAffected[0]) {
        sendText(res, 404, "Ride not found.");
        return;
      }

      sendText(res, 200, "Ride deprecation status updated.");
      return;
    }

    const rideParams = extractParams(pathname, "/rides/:id");
    if (req.method === "PUT" && rideParams) {
      if (!checkRolesMiddleware(req, [1, 2])) {
        sendText(res, 403, "Access denied");
        return;
      }
      const body = await parseJsonBody(req);
      const rideId = Number(rideParams.id);
      const { ride_name, ride_price, ride_status } = body;

      if (!Number.isInteger(rideId) || rideId <= 0) {
        sendText(res, 400, "Invalid ride id.");
        return;
      }

      if (!ride_name || ride_price == null || ride_status == null) {
        sendText(res, 400, "All required fields must be filled in.");
        return;
      }

      const parsedPrice = Number(ride_price);
      const parsedStatus = Number(ride_status);

      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        sendText(res, 400, "Ride price must be greater than 0.");
        return;
      }

      if (![0, 1].includes(parsedStatus)) {
        sendText(res, 400, "Ride status must be 0 (active) or 1 (closed).");
        return;
      }

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("ride_id", sql.Int, rideId);
      request.input("ride_name", sql.VarChar(50), ride_name.trim());
      request.input("ride_price", sql.Decimal(10, 2), parsedPrice);
      request.input("ride_status", sql.Int, parsedStatus);

      const result = await request.query(`
        UPDATE Ride
        SET ride_name = @ride_name,
            ride_price = @ride_price,
            ride_status = @ride_status
        WHERE ride_id = @ride_id
      `);

      if (!result.rowsAffected[0]) {
        sendText(res, 404, "Ride not found.");
        return;
      }

      sendStatus(res, 200);
      return;
    }

    const updateMaintenanceParams = extractParams(
      pathname,
      "/update-maintenance/:ticket_id",
    );
    if (req.method === "PUT" && updateMaintenanceParams) {
      const body = await parseJsonBody(req);
      const ticketId = updateMaintenanceParams.ticket_id;
      const {
        issue_type,
        maintenance_description,
        maintenance_priority,
        maintenance_status,
      } = body;

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("ticket_id", sql.Int, ticketId);
      request.input("issue_type", sql.VarChar(50), issue_type);
      request.input(
        "maintenance_description",
        sql.VarChar(sql.MAX),
        maintenance_description,
      );
      request.input(
        "maintenance_priority",
        sql.VarChar(20),
        maintenance_priority,
      );
      request.input("maintenance_status", sql.VarChar(20), maintenance_status);

      await request.query(`
        UPDATE Maintenance_Ticket
        SET
          issue_type = @issue_type,
          maintenance_description = @maintenance_description,
          maintenance_priority = @maintenance_priority,
          maintenance_status = @maintenance_status
        WHERE ticket_id = @ticket_id
      `);

      sendJson(res, 200, {
        success: true,
        message: "Ticket updated successfully",
      });
      return;
    }

    const alertAcknowledgeParams = extractParams(
      pathname,
      "/gift-shop/alerts/:id/acknowledge",
    );
    if (req.method === "PUT" && alertAcknowledgeParams) {
      if (!checkRolesMiddleware(req, [1, 3])) {
        sendText(res, 403, "Access denied");
        return;
      }
      const alertId = Number(alertAcknowledgeParams.id);

      if (!Number.isInteger(alertId) || alertId <= 0) {
        sendJson(res, 400, { message: "Invalid alert id." });
        return;
      }

      await ensureDbConnection();

      const tableCheck = await new sql.Request().query(`
        SELECT CASE
          WHEN OBJECT_ID('dbo.Gift_Shop_Low_Stock_Alert', 'U') IS NULL THEN 0
          ELSE 1
        END AS has_table
      `);

      if (!tableCheck.recordset[0]?.has_table) {
        sendJson(res, 400, { message: "Alert table does not exist." });
        return;
      }

      const request = new sql.Request();
      request.input("alert_id", sql.Int, alertId);

      const result = await request.query(`
        UPDATE Gift_Shop_Low_Stock_Alert
        SET acknowledged_at = SYSDATETIME()
        WHERE alert_id = @alert_id
          AND acknowledged_at IS NULL
      `);

      if (result.rowsAffected[0] === 0) {
        sendJson(res, 404, { message: "Alert not found." });
        return;
      }

      sendJson(res, 200, { success: true, message: "Alert acknowledged." });
      return;
    }

    const giftProductParams = extractParams(
      pathname,
      "/gift-shop/products/:id",
    );
    if (req.method === "PUT" && giftProductParams) {
      if (!checkRolesMiddleware(req, [1, 3])) {
        sendText(res, 403, "Access denied");
        return;
      }
      const body = await parseJsonBody(req);
      const productId = Number(giftProductParams.id);
      const { product_name, product_price, stock } = body;

      if (!Number.isInteger(productId) || productId <= 0) {
        sendJson(res, 400, { message: "Invalid product id." });
        return;
      }

      if (!product_name || product_price == null || stock == null) {
        sendJson(res, 400, {
          message: "Missing required product fields.",
        });
        return;
      }

      const parsedPrice = Number(product_price);
      const parsedStock = Number(stock);

      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        sendJson(res, 400, {
          message: "Product price must be greater than 0.",
        });
        return;
      }

      if (!Number.isInteger(parsedStock) || parsedStock < 0) {
        sendJson(res, 400, {
          message: "Stock must be a non-negative integer.",
        });
        return;
      }

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("product_id", sql.Int, productId);
      request.input("product_name", sql.VarChar(100), product_name.trim());
      request.input("product_price", sql.Decimal(10, 2), parsedPrice);
      request.input("stock", sql.Int, parsedStock);

      const result = await request.query(`
        UPDATE Gift_Shop
        SET product_name = @product_name,
            product_price = @product_price,
            stock = @stock
        WHERE product_id = @product_id
      `);

      if (result.rowsAffected[0] === 0) {
        sendJson(res, 404, { message: "Product not found." });
        return;
      }

      sendJson(res, 200, {
        success: true,
        message: "Product updated successfully.",
      });
      return;
    }

    const customerReactivateParams = extractParams(
      pathname,
      "/customers/:id/reactivate",
    );
    if (req.method === "PATCH" && customerReactivateParams) {
      const id = customerReactivateParams.id;
      await ensureDbConnection();
      const request = new sql.Request();
      request.input("id", sql.Int, id);
      const result = await request.query(`
        UPDATE Customers
        SET is_active = 1
        WHERE customer_id = @id
          AND is_active = 0
      `);

      if (result.rowsAffected[0] === 0) {
        sendText(res, 404, "Customer not found or already active.");
        return;
      }

      sendStatus(res, 200);
      return;
    }

    const customerDeactivateParams = extractParams(
      pathname,
      "/customers/:id/deactivate",
    );
    if (req.method === "PATCH" && customerDeactivateParams) {
      const id = customerDeactivateParams.id;
      await ensureDbConnection();
      const request = new sql.Request();
      request.input("id", sql.Int, id);
      const result = await request.query(`
        UPDATE Customers
        SET is_active = 0
        WHERE customer_id = @id
          AND is_active = 1
      `);

      if (result.rowsAffected[0] === 0) {
        sendText(res, 404, "Customer not found or already inactive.");
        return;
      }

      sendStatus(res, 200);
      return;
    }

    const customerParams = extractParams(pathname, "/customers/:id");
    if (req.method === "PUT" && customerParams) {
      const body = await parseJsonBody(req);
      const { phone_number, email_address } = body;
      const id = customerParams.id;

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("id", sql.Int, id);
      request.input("phone_number", sql.Char(10), phone_number);
      request.input("email_address", sql.VarChar(255), email_address);

      await request.query(`
        UPDATE Customers
        SET phone_number = @phone_number,
            email_address = @email_address
        WHERE customer_id = @id
      `);

      sendStatus(res, 200);
      return;
    }

    const deleteProductParams = extractParams(
      pathname,
      "/gift-shop/products/:id",
    );
    if (req.method === "DELETE" && deleteProductParams) {
      if (!checkRolesMiddleware(req, [1, 3])) {
        sendText(res, 403, "Access denied");
        return;
      }
      const productId = Number(deleteProductParams.id);

      if (!Number.isInteger(productId) || productId <= 0) {
        sendJson(res, 400, { message: "Invalid product id." });
        return;
      }

      await ensureDbConnection();
      const request = new sql.Request();
      request.input("product_id", sql.Int, productId);

      const result = await request.query(`
        DELETE FROM Gift_Shop
        WHERE product_id = @product_id
      `);

      if (result.rowsAffected[0] === 0) {
        sendJson(res, 404, { message: "Product not found." });
        return;
      }

      sendJson(res, 200, {
        success: true,
        message: "Product deleted successfully.",
      });
      return;
    }

    await serveStaticFile(req, res);
  } catch (err) {
    console.error("Error:", err);
    const message = err?.message || "Internal Server Error";

    if (!res.writableEnded) {
      sendText(res, 500, message);
    }
  }
}

const server = http.createServer(handleRequest);

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
