CREATE TRIGGER SetRideActiveWhenTicketsClosed
ON Maintenance_Ticket
AFTER UPDATE
AS
BEGIN
    UPDATE r
    SET r.ride_status = 0
    FROM Ride r
    JOIN inserted i
        ON r.ride_id = i.ride_id
  WHERE i.maintenance_status = 'resolved'
      AND NOT EXISTS (
          SELECT 1
          FROM Maintenance_Ticket mt
          WHERE mt.ride_id = r.ride_id
          AND mt.maintenance_status IN ('open', 'in-progress')
      );
END;