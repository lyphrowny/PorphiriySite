import os

from fastapi import FastAPI, WebSocket, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship

DATABASE_URL = "postgresql://postgres:postgres@db:5432/assistants_db"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

aclient = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Set your OpenAI API key

app = FastAPI()


class Assistant(Base):
    __tablename__ = "assistants"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    avatar_url = Column(String)
    initial_message = Column(String)
    chat_history = relationship("ChatHistory", back_populates="assistant")


class ChatHistory(Base):
    __tablename__ = "chat_history"
    id = Column(Integer, primary_key=True, index=True)
    assistant_id = Column(Integer, ForeignKey('assistants.id'))
    role = Column(String)
    content = Column(String)
    assistant = relationship("Assistant", back_populates="chat_history")


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the database with the five assistants
def initialize_assistants():
    db = SessionLocal()
    assistants = [
        {
            "name": "Художник",
            "avatar_url": "https://api.dicebear.com/6.x/bottts/svg?seed=Artist",
            "initial_message": "Здравствуйте, я Художник. Как могу помочь вам в мире искусства?"
        },
        {
            "name": "Экономист",
            "avatar_url": "https://api.dicebear.com/6.x/bottts/svg?seed=Economist",
            "initial_message": "Приветствую, я Экономист. Спрашивайте всё, что касается экономики и финансов."
        },
        {
            "name": "Бухгалтер",
            "avatar_url": "https://api.dicebear.com/6.x/bottts/svg?seed=Accountant",
            "initial_message": "Здравствуйте, я Бухгалтер. Готов помочь с финансовыми расчетами и отчетностью."
        },
        {
            "name": "Ученый",
            "avatar_url": "https://api.dicebear.com/6.x/bottts/svg?seed=Scientist",
            "initial_message": "Привет, я Ученый. Могу помочь с научными вопросами."
        },
        {
            "name": "Инженер",
            "avatar_url": "https://api.dicebear.com/6.x/bottts/svg?seed=Engineer",
            "initial_message": "Здравствуйте, я Инженер. Могу помочь с техническими и инженерными задачами."
        }
    ]

    for assistant_data in assistants:
        assistant = db.query(Assistant).filter_by(name=assistant_data["name"]).first()
        if not assistant:
            assistant = Assistant(**assistant_data)
            db.add(assistant)
    db.commit()
    db.close()

initialize_assistants()


@app.get("/assistants/")
def read_assistants(db: Session = Depends(get_db)):
    return db.query(Assistant).all()


@app.get("/assistants/{assistant_id}/history/")
def read_assistant_history(assistant_id: int, db: Session = Depends(get_db)):
    return db.query(ChatHistory).filter(ChatHistory.assistant_id == assistant_id).all()


class ChatRequest(BaseModel):
    message: str
    model: str = "gpt-3.5-turbo"


@app.websocket("/ws/chat/")
async def chat_with_gpt(websocket: WebSocket):
    await websocket.accept()
    try:
        data = await websocket.receive_json()

        message = data.get("message", "")
        model = data.get("model", "gpt-3.5-turbo")
        assistant_id = data.get("assistant_id")

        db = SessionLocal()

        # Save user message to history
        user_message = ChatHistory(assistant_id=assistant_id, role="user", content=message)
        db.add(user_message)
        db.commit()

        full_response = ""
        response = await aclient.chat.completions.create(model=model,
        messages=[
            {"role": "user", "content": message}
        ],
        stream=True)

        async for chunk in response:
            content = chunk.choices[0].delta.content
            if content:
                await websocket.send_text(content)
                full_response += content

        # Save assistant response to history
        if full_response:
            assistant_message = ChatHistory(assistant_id=assistant_id, role="assistant", content=full_response)
            db.add(assistant_message)
            db.commit()

    except Exception as e:
        await websocket.send_text(f"Error: {str(e)}")
    finally:
        await websocket.close()