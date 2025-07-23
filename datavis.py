import matplotlib.pyplot as plt
import numpy as np
import sqlite3
from datetime import datetime

def linegraph(start_time: datetime, end_time: datetime, resolution):
    interval = resolution * 60
    conn = sqlite3.connect("lanecounts.db")

    cur = conn.cursor()

    start_time_ms = int(start_time.timestamp() * 1000)
    end_time_ms = int(end_time.timestamp() * 1000)

    lanes = cur.execute("""
                SELECT * FROM lanecounts WHERE timestamp > ? AND timestamp < ?
                """, (start_time_ms, end_time_ms))
    
    laneData = lanes.fetchall()
    conn.close()
    
    # Sort lane data 
    # NB1, NB2, SB1, SB2
    xWidth = int((end_time_ms - start_time_ms) / (interval * 1000))
    sortedData = np.zeros((4, xWidth))
    for bin in laneData:
        bindex = int((bin[3] - start_time_ms) / (interval * 1000)) - 1
        sortedData[(0 if bin[1] == 'NB' else 2) + (bin[2]-1)][bindex] = bin[5]

    for dataBin in sortedData:
        plt.plot(dataBin)
    plt.show()


if __name__ == "__main__":
    start_time = datetime(2025, 7, 21)
    end_time = datetime.now()
    resolution = 5
    linegraph(start_time, end_time, resolution)

