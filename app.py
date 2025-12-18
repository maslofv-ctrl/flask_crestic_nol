from flask import Flask, render_template, request, jsonify
import time
import threading
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'

# Store room state: { room_id: { board: [9xNone], players: [uid1, uid2], turn: uid1, last_update: timestamp } }
rooms = {}

# Cleanup thread to remove old rooms (optional, simple implementation)
def cleanup_rooms():
    while True:
        time.sleep(600) # Every 10 minutes
        now = time.time()
        to_delete = []
        for rid, room in rooms.items():
            if now - room['last_update'] > 3600: # 1 hour inactivity
                to_delete.append(rid)
        for rid in to_delete:
            del rooms[rid]

threading.Thread(target=cleanup_rooms, daemon=True).start()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/join', methods=['POST'])
def join_game():
    data = request.json
    room_id = data.get('room')
    user_id = str(uuid.uuid4()) # Generate a unique ID for the player
    
    if not room_id:
        return jsonify({'error': 'Room ID required'}), 400

    if room_id not in rooms:
        rooms[room_id] = {
            'board': [None]*9, 
            'players': [], 
            'turn': None,
            'winner': None,
            'last_update': time.time()
        }
    
    room = rooms[room_id]
    
    if len(room['players']) >= 2:
        return jsonify({'error': 'Room is full'}), 400
    
    room['players'].append(user_id)
    room['last_update'] = time.time()
    
    player_index = len(room['players']) - 1
    
    # If 2 players, start game
    if len(room['players']) == 2:
        room['turn'] = room['players'][0]
        
    return jsonify({
        'user_id': user_id,
        'player_index': player_index,
        'room_id': room_id
    })

@app.route('/api/state', methods=['GET'])
def get_state():
    room_id = request.args.get('room')
    user_id = request.args.get('user_id')
    
    if not room_id or room_id not in rooms:
        return jsonify({'error': 'Room not found'}), 404
        
    room = rooms[room_id]
    room['last_update'] = time.time() # Keep alive
    
    # Check if game started
    game_active = len(room['players']) == 2
    
    my_turn = False
    if game_active and room['turn'] == user_id:
        my_turn = True
        
    # Translate board for client (0 or 1 instead of user_ids)
    client_board = []
    for cell in room['board']:
        if cell is None:
            client_board.append(None)
        else:
            # Find index of player in players array to send 0 or 1
            try:
                p_idx = room['players'].index(cell)
                client_board.append(p_idx)
            except:
                client_board.append(None)

    response = {
        'game_active': game_active,
        'board': client_board,
        'my_turn': my_turn,
        'winner': room['winner'],
        'player_count': len(room['players'])
    }
    
    # If winner is determined, translate winner ID to player index
    if room['winner'] and room['winner'] != 'draw':
        try:
            response['winner'] = room['players'].index(room['winner'])
        except:
            pass
            
    return jsonify(response)

@app.route('/api/move', methods=['POST'])
def make_move():
    data = request.json
    room_id = data.get('room')
    user_id = data.get('user_id')
    index = data.get('index')
    
    if not room_id or room_id not in rooms:
        return jsonify({'error': 'Room not found'}), 404
        
    room = rooms[room_id]
    
    if room['winner']:
        return jsonify({'error': 'Game over'}), 400
        
    if room['turn'] != user_id:
        return jsonify({'error': 'Not your turn'}), 400
        
    if room['board'][index] is not None:
        return jsonify({'error': 'Cell occupied'}), 400
        
    # Make move
    room['board'][index] = user_id
    room['last_update'] = time.time()
    
    # Check winner
    winner = check_winner(room['board'])
    if winner:
        room['winner'] = winner
    elif None not in room['board']:
        room['winner'] = 'draw'
    else:
        # Switch turn
        current_idx = room['players'].index(user_id)
        next_idx = 1 - current_idx
        room['turn'] = room['players'][next_idx]
        
    return jsonify({'success': True})

def check_winner(board):
    wins = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
    ]
    for w in wins:
        if board[w[0]] is not None and board[w[0]] == board[w[1]] == board[w[2]]:
            return board[w[0]]
    return None

if __name__ == '__main__':
    app.run(debug=True, port=5000)
