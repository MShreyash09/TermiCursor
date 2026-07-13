import os
import asyncio
from dotenv import load_dotenv

load_dotenv()
os.environ["LANGFUSE_HOST"] = os.getenv("LANGFUSE_BASE_URL", "https://us.cloud.langfuse.com")
from langchain_groq import ChatGroq
from langfuse.langchain import CallbackHandler
from langchain_core.messages import HumanMessage
import uuid

async def main():
    api_key = os.getenv("GROQ_API_KEY")
    llm = ChatGroq(model="llama-3.1-8b-instant", api_key=api_key)
    chat_id = str(uuid.uuid4())[:8]
    
    handler = CallbackHandler() # v4 initialization
    
    print("Testing invoke...")
    res = llm.invoke(
        [HumanMessage(content="Hello")], 
        config={
            "callbacks": [handler],
            "metadata": {
                "langfuse_session_id": f"test_groq_{chat_id}",
                "langfuse_user_id": "test_user",
                "langfuse_tags": ["test"]
            }
        }
    )
    print("Invoke response:", res.content)
    handler.flush()
    print("Flushed invoke!")
    
if __name__ == "__main__":
    asyncio.run(main())
