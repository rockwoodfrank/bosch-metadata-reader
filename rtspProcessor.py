import subprocess
from time import sleep
from xmlmetadata import parseXml
import re

from dbinterface import add_count
from graphs import graph_cameraObjects
from collectData import pushObjectData

from readConfig import readAddress

from pointSearch import setLanes, whichLane

def stream_data(address, name, threshold, whichLane, dataPushFunction = add_count):
    command = f'ffmpeg -i "rtsp://{address}/rtsp_tunnel?p=0&line=1&inst=1&vcd=2" -map 0:d -c copy -copy_unknown -f data -'

    with subprocess.Popen(
        command, stdout=subprocess.PIPE, shell=True
    ) as process:
        def poll_and_read():
            incomplete_packet = True
            xmlPacket = ""
            while incomplete_packet:
                process.poll()
                stream_data = process.stdout.read1().decode('utf-8')
                # print(process.stdout.read1().decode('utf-8'))
                beginResult = re.search(r'<tt:MetadataStream', stream_data)
                if beginResult:
                    # set the xml packet to be the start of the packet
                    xmlPacket = stream_data[beginResult.start():]
                elif xmlPacket != "":
                    # add all of the data to the xmlPacket
                    xmlPacket += stream_data
                # look for an ending in the xml packet, cut off the packet there
                endResult = re.search(r'</tt:MetadataStream>', xmlPacket)
                if endResult:
                    # cutoff
                    xmlPacket = xmlPacket[:endResult.end()]
                    # return data
                    return xmlPacket

        # sleep(3)
        i = 0
        dropNum = 2
        while True:
            xml_packet = poll_and_read()
            # TODO: Drop packets to keep up with speed
            if i >= dropNum:
                frameObjects = parseXml(xml_packet, threshold, whichLane) 
                if frameObjects != None:
                    # graph_cameraObjects(frameObjects)
                    pushObjectData(frameObjects, name, data_push_function = dataPushFunction)
                i = 0
            i += 1

if __name__ == "__main__":
    # TODO: Add zone calculator and data storer
    url = readAddress()
    threshold = 0.379
    lanes = (([0.828, -0.125, -0.203, 0.516],[-1, threshold, threshold, -1]), ([0.513, -0.20625, -0.281, 0.219], [-1, threshold, threshold,-1]), ([1, 0.031, -0.047, 1],[-0.495,threshold,threshold, -0.732]), ([1, 0.109, 0.034, 1],[-0.263,threshold,threshold, -0.489]))
    setLanes(lanes)
    stream_data(url, "dunbarton", threshold, whichLane)

