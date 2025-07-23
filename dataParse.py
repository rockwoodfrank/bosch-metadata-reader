import json
import bitstring
import matplotlib.pyplot as plt

class Packet:
    def __init__(self):
        self.continuation = 0
        self.continued = 0
        self.tag = 0
        self.type = ''
        self.layer = 0
        self.length = 0
        self.data = []
        # Frame information
        self.skip = 0
        self.width = 0
        self.height = 0

        # Counters
        self.count = 0
        self.counter = 0

        # Object Properties
        self.id = 0
        self.unchanged = 0
        self.alarm = 0
        self.idle = 0
        self.removed = 0
        self.splitOff = 0
        # I don't know what this means yet
        self.uncovered_background_by_started_track = 0
        self.selected_for_dome_tracking = 0
        self.frozen_idle_dome_tracking = 0
        self.idletime = 0
        self.objects: list[CamObject] = []


class CamObject:
    def __init__(self):
        # Initialized properties
        self.type = 0
        self.continuation = 0
        self.continued = 0
        self.length = 0
        self.data = 0
        
        # The description of the packet:
        # 6: Class Descriptor
        # 12: Polygon data
        self.name = ''

        # Object class: data about what the object is
        # Certainty that it is that class, from 0 to 256
        self.certainty = 0
        '''
            Object classes:
            1. Person
            3. Car
            5. Bike
            6. Truck
        '''
        self.classid = 0
        # Object subclass - if the packet is longer than 2
        self.subclassid = 0

        self.poly: Polygon = Polygon()
        self.size = 0

class DimensionedObject:
    def __init__(self):
        self.x = 0
        self.y = 0
        self.width = 0
        self.height = 0

class Polygon:
    def __init__(self):
        # Bounding box
        self.bb = DimensionedObject()
        self.center = DimensionedObject()
        self.base = DimensionedObject()
        self.start = DimensionedObject()



data = ''

'''
NOTE: Motion maps don't seem to show up in streams. Put this on the back burner
'''
def parse_motionmap(pkt:Packet):
    print("motion map")


xVals = []
yVals = []

# Parse the polygon data
def parseShapePoly(obj:CamObject):
    obj.name = "current_shape_poly"
    # Size of position data - given in "nibbles minus 1." So a zero means each data is 4 bits long
    nibbles_minus1_pos = obj.data.read('uint:2')
    pos_bit_size = (nibbles_minus1_pos + 1) * 4
    nibbles_minus1_dim = obj.data.read('uint:2')
    dim_bit_size = (nibbles_minus1_dim + 1) * 4

    # Bounding box - I believe it's the bottom left corner
    # Position bits are SIGNED!
    obj.poly.bb.x = obj.data.read(f'int:{pos_bit_size}')
    obj.poly.bb.y = obj.data.read(f'int:{pos_bit_size}')
    # Dimension bits are unsigned
    obj.poly.bb.width = obj.data.read(f'uint:{dim_bit_size}')
    obj.poly.bb.width = obj.data.read(f'uint:{dim_bit_size}')

    # Center
    obj.poly.center.x = obj.data.read(f'uint:{dim_bit_size}')
    obj.poly.center.y = obj.data.read(f'uint:{dim_bit_size}')
    xVals.append(obj.poly.center.x)
    yVals.append(obj.poly.center.y)
    # Base
    obj.poly.base.x = obj.data.read(f'int:{pos_bit_size}')
    obj.poly.base.y = obj.data.read(f'int:{pos_bit_size}')
    # Start
    obj.poly.start.x = obj.data.read(f'uint:{dim_bit_size}')
    obj.poly.start.y = obj.data.read(f'uint:{dim_bit_size}')
    # Object Size
    obj.size = obj.data.read(f'uint:{dim_bit_size*2}')
    # Number of vertices - 1
    num_vertices_minus_1 = obj.data.read('uint:16')
    bits_minus_1_delta_pos = obj.data.read('uint:4')
    n = bits_minus_1_delta_pos + 1
    for i in range(0, num_vertices_minus_1):
        dx = obj.data.read(f'int:{n}')
        dy = obj.data.read(f'int:{n}')
    # Number of bits - 1
    # Iterate through all of the vertices

    return obj

# Used a lot. Look into this
def parse_objproperties(pkt:Packet):
    print("Here")
    if len(pkt.data) < 36:
        print(f"{len(pkt.data)} vs. {pkt.length}")
    # Header size:
    
    pkt.id = pkt.data.read('uint:32')
    pkt.unchanged = pkt.data.read('uint:1') != 0
    pkt.alarm = pkt.data.read('uint:1') != 0
    pkt.idle = pkt.data.read('uint:1') != 0
    pkt.removed = pkt.data.read('uint:1') != 0
    pkt.splitOff = pkt.data.read('uint:1') != 0
    pkt.uncovered_background_by_started_track = pkt.data.read('uint:1') != 0
    pkt.selected_for_dome_tracking = pkt.data.read('uint:1') != 0
    pkt.frozen_idle_dome_tracking = pkt.data.read('uint:1') != 0

    if pkt.idle:
        print(f"idlepacket: {pkt.idle}")
        pkt.idletime = pkt.data.read('uint:32')

    pkt.objects = []
    # while(pkt.data.pos < len(pkt.data)):
    #     # TODO: Continutation stuff
    #     obj = CamObject()
    #     obj.type = pkt.data.read('uint:8')
    #     obj.continuation = pkt.data.read('uint:1') != 0
    #     obj.continued = pkt.data.read('uint:1') != 0
    #     obj.length = pkt.data.read('uint:6')
    #     obj.data = pkt.data.read(obj.length * 8)
    #     # if (obj.type == 0x06):
    #     #     obj.name = 'object_class'
    #     #     obj.certainty = obj.data.read('uint:8')
    #     #     obj.classid = obj.data.read('uint:8')
    #     #     # if (len(obj.data) > 2):
    #     #     #     obj.subclassid = obj.data.read('uint:8')
    #     # elif (obj.type == 0x12):
    #     #     # polygon
    #     #     # obj = parseShapePoly(obj)
    #     #     pass
    #     # else:
    #     #     obj.name = 'unknown'
    #     pkt.objects.append(obj)
    # plt.scatter(xVals, yVals)
    # plt.show()

def parse_tag(pkt:Packet):
    if pkt.tag == 0x01:
        pkt.type = 'frameinfo'
        # TODO: Make these into numbers rather than arrays
        pkt.skip = pkt.data.read('uint:16')
        pkt.width = pkt.data.read('uint:16')
        pkt.height = pkt.data.read('uint:16')
    elif pkt.tag == 0x02:
        pkt.type = 'alarmflags'
    elif pkt.tag == 0x03:
        pkt.type = 'motionmap'
        # TODO: Parse motion map
        parse_motionmap(pkt)
    elif pkt.tag == 0x04:
        pkt.type = 'objectproperties'
        # TODO: Parse object properties
        parse_objproperties(pkt)
    elif pkt.tag == 0x05:
        pkt.type = 'eventstate'
    elif pkt.tag == 0x26:
        pkt.type = 'counters'
        # TODO: Counters stuff
    elif pkt.tag == 0x32:
        pkt.type = 'vcdalarm'
    elif pkt.tag == 0x3a:
        pkt.type = 'domestate'
        # TODO: Parse dome state
    elif pkt.tag == 0x3d:
        pkt.type = 'textdisplay'
    elif pkt.tag == 0x3e:
        pkt.type = 'faceproperties'
        # TODO: Parse face properties
    elif pkt.tag == 0x49:
        pkt.type = 'flamedetection'
        # TODO: Flame detection info?
    elif pkt.tag == 0x4a:
        pkt.type = 'smokedetection'
        # TODO: Smoke detection info?
    elif pkt.tag == 0x51:
        pkt.type = 'audioanalysis'
    elif pkt.tag == 0xfe:
        pkt.type = 'blank'
    elif pkt.tag == 0xff:
        pkt.type = 'vcaconfig'
        # TODO: VCA?
    else:
        pkt.type = 'unknown'

def make_packets(pkts) -> list[Packet]:
    objs = []
    valueStream = bytearray(pkts)
    values = bitstring.BitStream(valueStream)
    pending_pkt = None
    while (values.pos < len(values)):
        pkt = Packet()
        # TODO: Continuation Logic
        # Each packet has a 2 byte header
        # The continuation bit tells the decoder if the packet is a continuation of the previous packet
        pkt.continuation = values.read('uint:1')
        # The continued bit tells the decoder if the packet continues into the next packet
        pkt.continued = values.read('uint:1')
        # The tag determines the type of packet
        pkt.tag = values.read('uint:14')
        # print(pkt.tag)
        pkt.layer = values.read('uint:4')
        pkt.length = values.read('uint:12')
        pkt.data = values.read(pkt.length * 8)
        
        if (pkt.continuation == 1):
            if pending_pkt != None:
                if (pending_pkt.tag == pkt.tag):
                    pending_pkt.data.append(pkt.data)
                    pkt.data = pending_pkt.data
                    pkt.length = len(pkt.data)
                    pkt.continuation = 0
                    if not pkt.continued:
                        pending_pkt = None
                else: print("Different tags")
            else: 
                print("Pending is null")
        if (pkt.continued == 1):
            pending_pkt = pkt
        # print(pkt.continuation)
        parse_tag(pkt)
        objs.append(pkt)
    return objs

with open("newestdata2.json") as f:
    data = json.loads(f.read())


for pkts in data:
    packets:list[Packet] = make_packets(pkts['data']['data'])
    for packet in packets:
        if packet.type == "objectproperties":
            for obj in packet.objects:
                # print(obj.type)
                if obj.type == 0x06:
                    print(obj.classid)


# test = [129, 0]
# make_packets(test)