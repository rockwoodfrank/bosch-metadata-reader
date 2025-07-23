from splinter import Browser
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from objsParse import parse_metadata
from dbinterface import pushObjectData

from readConfig import readAddress



# chrome_options = Options()
# chrome_options.add_argument("--disable-web-security")
# # chrome_options.add_argument("--disable-features=IsolateOrigins,site-per-process")
# chrome_options.add_argument("--allow-running-insecure-content")
# chrome_options.add_argument("--user-data-dir=/tmp/chrome-user-data")
# chrome_options.add_extension('csp-disable.crx')
 


driver = webdriver.Chrome()

collection_interval = 1
refreshTimeMinutes = 30

while True:
  driver.get(f'http://{readAddress()}/view.html?mode=l')

  # driver.execute_script(script)

  # script_loader = """
  #     let script = document.createElement("script")
  #     script.type = "text/javascript"
  #     script.src = "~/myscript.js"
  #     document.getElementsByTagName("head")[0].appendChild(script)
  # """

  # script_remover = """
  #     let scripts = Array.from(document.getElementsByTagName('script'));
  #     for(let script of scripts) {
  #         if(script.src.includes("utils.js")) {
  #             script.parentNode.removeChild(script);
  #             console.log("Script removed: " + script.src);
  #         }
  #     }
  # """

  time.sleep(15)

  driver.execute_script("""
                        CT__metaDataCaptured__ = [];
                        function hookParserOutput(data) {
                          CT__metaDataCaptured__.push([data, Date.now()])
                        }

                      const infoSocket = new WebSocket("ws://localhost:12345")
                        infoSocket.addEventListener("open", (event) => {
                          infoSocket.send("Hello!");
                        })

                      const oldParser = BoschMetaDataParser.parse
                      BoschMetaDataParser.parse = function(msg) { 
                          result = oldParser(msg)
                          hookParserOutput(result)
                      } 
                      var data = []
      """)

  time.sleep(5)

  i = 0
  numCollections = (refreshTimeMinutes * 60) / collection_interval
  while i < numCollections:
      result = driver.execute_script("""
              data = null;
              data = CT__metaDataCaptured__ || [];
              CT__metaDataCaptured__ = null;  // clear after read
              CT__metaDataCaptured__ = [];  // clear after read
              return data;
                                  """)
      # print(f"Data rate: {len(str(result)) / 30} bytes / sec")
      if len(result) != 0:
          for packet in result:
              pushObjectData(parse_metadata(packet), "dunbarton")

      time.sleep(collection_interval)
      i += 1