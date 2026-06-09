CREATE TRIGGER CreateMaintenanceTicketFromRideComplaints
ON Complaint
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

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
    SELECT DISTINCT
        ride_complaints.ride_id,
        1,
        GETDATE(),
        'multiple-complaints',
        'Automatically created because 5 or more complaints were submitted for this ride within 7 days.',
        'high',
        'open'
    FROM
    (
        SELECT 
            TRY_CAST(i.complaint_type AS INT) AS ride_id
        FROM inserted i
        WHERE TRY_CAST(i.complaint_type AS INT) IS NOT NULL
    ) AS ride_complaints
    WHERE
    (
        SELECT COUNT(*)
        FROM Complaint c
        WHERE TRY_CAST(c.complaint_type AS INT) = ride_complaints.ride_id
          AND c.incident_date >= DATEADD(DAY, -7, CAST(GETDATE() AS DATE))
    ) >= 5
    AND NOT EXISTS
    (
        SELECT 1
        FROM Maintenance_Ticket mt
        WHERE mt.ride_id = ride_complaints.ride_id
          AND mt.maintenance_status IN ('open', 'in-progress')
    );
END;
GO