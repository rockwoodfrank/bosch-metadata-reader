import subprocess
from time import sleep
from xmlmetadata import parseXml
import re

from graphs import graph_cameraObjects
from dbinterface import pushObjectData

from readConfig import readAddress


command = f"ffmpeg -i rtsp://{readAddress()}/rtsp_tunnel?p=0&line=1&inst=1&vcd=2 -map 0:d -c copy -copy_unknown -f data -"

with subprocess.Popen(
    command.split(), stdout=subprocess.PIPE
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
            frameObjects = parseXml(xml_packet) 
            if frameObjects != None:
                # graph_cameraObjects(frameObjects)
                pushObjectData(frameObjects, "dunbarton")
            i = 0
        i += 1

