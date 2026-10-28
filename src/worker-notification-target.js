export function workerNotificationTarget(note={}){
 const type=String(note.type||'').toLowerCase();
 const screen=/attendance|shift_completed/.test(type)?'attendance':/request|advance|leave/.test(type)?'requests':/task/.test(type)?'tasks':'bookings';
 const entity=screen==='tasks'?note.taskId||note.entityId:screen==='requests'?note.requestId||note.entityId:screen==='bookings'?note.bookingId||note.bookingCode||note.entityId:null;
 return {screen,entity:typeof entity==='string'&&entity.length<=150?entity:null};
}
