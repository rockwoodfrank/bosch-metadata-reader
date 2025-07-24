import sqlite3
import datetime

def add_count(roadObjectData):
    conn = sqlite3.connect("lanecounts.db")

    cur = conn.cursor()
    direction = "SB" if int(roadObjectData["lane"] / 2) == 0 else "NB"
    lane = (roadObjectData["lane"] % 2) + 1

    timestampValue = roadObjectData["timestamp"].timestamp() * 1000
    roundedTimestamp = timestampValue - (timestampValue % (300 * 1000))
    # Determine if a bin for the data exists already
    query = f"""
        SELECT * FROM lanecounts WHERE timestamp = {roundedTimestamp} AND location = '{roadObjectData["location"]}' AND direction = '{direction}' AND lane = {lane}
    """
    res = cur.execute(query)
    output = res.fetchall()

    # If it does, increment its count
    if len(output) > 0:
        cur.execute("""
            UPDATE lanecounts SET vehicle_count = vehicle_count + 1 WHERE location = ? AND direction = ? AND lane = ? AND timestamp = ?     
            """, (roadObjectData["location"], direction, lane, roundedTimestamp))
    # # Otherwise, insert the new table
    else:
        query = f"""
            INSERT INTO laneCounts VALUES
                ('{roadObjectData["location"]}', '{direction}', {lane}, {roundedTimestamp}, 300, 1)
        """
        cur.execute(query)
    conn.commit()
    conn.close()


