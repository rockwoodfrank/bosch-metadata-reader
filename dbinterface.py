from typing import Dict
import sqlite3
from camera_object import CameraObject


# class CameraObject:
#     def __init__(self, id, timestamp, detectedType, lane, speed, idle):
#         self.id             = id
#         self.timestamp      = timestamp
#         self.detectedType   = detectedType
#         self.lane           = lane
#         self.speed          = speed
#         self.idle           = idle
#         self.numberOfUpdates = 1
#         self.modified       = 1

#     def add_data(self, objectData):
#         self.numberOfUpdates += 1
#         self.modified = 1
#         self.detectedType = self.get_running_average(self.detectedType, objectData["type"])
#         if objectData["lane"] >= 0:
#             self.lane = self.get_running_average(self.lane, objectData["lane"])
#         self.speed = self.get_running_average(self.speed, objectData["speed"])
#         self.idle = self.get_running_average(self.idle, objectData["idle"])
        
#     def get_running_average(self, oldValue, newValue):
#         return (oldValue * ((self.numberOfUpdates-1)/self.numberOfUpdates)) + (newValue / self.numberOfUpdates)

#     def get_data(self):
#         return self.timestamp, round(self.detectedType), round(self.lane), round(self.speed), round(self.idle)
    
#     def __str__(self):
#         return f"{self.id}: {self.timestamp}, {self.detectedType}, lane {self.lane}, {self.speed}, {self.idle}, Updated {self.numberOfUpdates} times"

def add_count(location, direction, lane, timestamp):
    conn = sqlite3.connect("lanecounts.db")

    cur = conn.cursor()
    roundedTimestamp = int(timestamp - (timestamp % (300 * 1000)))
    # Determine if a bin for the data exists already
    query = f"""
        SELECT * FROM lanecounts WHERE timestamp = {roundedTimestamp} AND location = '{location}' AND direction = '{direction}' AND lane = {lane}
    """
    res = cur.execute(query)
    output = res.fetchall()

    # If it does, increment its count
    if len(output) > 0:
        cur.execute("""
            UPDATE lanecounts SET vehicle_count = vehicle_count + 1 WHERE location = ? AND direction = ? AND lane = ? AND timestamp = ?     
            """, (location, direction, lane, roundedTimestamp))
    # # Otherwise, insert the new table
    else:
        query = f"""
            INSERT INTO laneCounts VALUES
                ('{location}', '{direction}', {lane}, {roundedTimestamp}, 300, 1)
        """
        cur.execute(query)
    conn.commit()
    conn.close()


# Two data structures:
# One with the active objects(data existed in the last push, data exists in this push)
activeRoadObjects: Dict[str, CameraObject] = {}

# One with past objects(FIFO queue), upon the addition of a new object, the last object is pushed to the database
recentQueueThreshold = 20
recentQueue: list[CameraObject] = []

def pushObjectData(objects, location):
    for roadObject in objects:
        searchID = str(roadObject["id"]) if type(roadObject) == dict else roadObject.id

        # Check to see if the objects already exist
        if searchID in activeRoadObjects:
            # If they do, update their data
            activeRoadObjects[searchID].add_data(roadObject)
        # If they don't,
        else:
            # First check the recent queue to see if they are there. If they are, re-add them to the active queue and update their data
            if searchID in recentQueue:
                objectIndex = recentQueue.index(searchID)
                returningObject = recentQueue.pop(objectIndex)

                returningObject.add_data(roadObject)

                if activeRoadObjects[searchID] != None:
                    raise ValueError
                activeRoadObjects[searchID] = returningObject
            # Otherwise, create a new instance
            else:
                newObject = roadObject if type(roadObject) == CameraObject else CameraObject(searchID, roadObject["timestamp"], roadObject["type"], roadObject["lane"], roadObject["speed"], roadObject["idle"])
                activeRoadObjects[searchID] = newObject
            

    # Grab all of the objects that were not modified this update, move them to the past queue
    objectsToPush = []
    for roadObject in activeRoadObjects:
        if activeRoadObjects[roadObject].modified == 0:
            objectsToPush.append(roadObject)
        else: activeRoadObjects[roadObject].modified = 0

    for roadObject in objectsToPush:
        # If the past queue is full, move the oldest ones onto the database
        tempObject = activeRoadObjects.pop(roadObject)
        recentQueue.append(tempObject)


    while len(recentQueue) > recentQueueThreshold:
        objectToAddToDB = recentQueue.pop(0)
        timestamp, objectType, lane, speed, idle = objectToAddToDB.get_data()
        add_count(location, "SB" if int(lane / 2) == 0 else "NB", (lane % 2) + 1, timestamp)

    # print(activeRoadObjects)
    # print(len(activeRoadObjects))
    # if len(activeRoadObjects) == 39:
    # for roadObject in activeRoadObjects:
    #     print(activeRoadObjects[roadObject])
    # print(recentQueue)

# conn.close()