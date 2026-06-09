CREATE TRIGGER SetRideUnderMaintenance
ON Maintenance_Ticket
AFTER INSERT, UPDATE
AS
BEGIN
    UPDATE r
    SET r.ride_status = 1
    FROM Ride r
    JOIN inserted i
        ON r.ride_id = i.ride_id
    WHERE i.maintenance_status IN ('open', 'in-progress');
END;

-- haven't ran yet waiting for finalization of ride status ints, maybe adding in progress to maintenance_status later